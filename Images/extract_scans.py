import os
import cv2
import numpy as np
import fitz  # PyMuPDF

def deskew_image_robust(image):
    """Straightens the overall page using text baselines."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi/180, 100, minLineLength=100, maxLineGap=10)
    
    if lines is not None:
        angles = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
            if -15 < angle < 15: angles.append(angle)
            elif 75 < angle < 105: angles.append(angle - 90)
            elif -105 < angle < -75: angles.append(angle + 90)
        
        if angles:
            median_angle = np.median(angles)
            (h, w) = image.shape[:2]
            M = cv2.getRotationMatrix2D((w // 2, h // 2), median_angle, 1.0)
            rotated = cv2.warpAffine(image, M, (w, h), flags=cv2.INTER_CUBIC, 
                                     borderMode=cv2.BORDER_CONSTANT, borderValue=(255,255,255))
            return rotated
    return image

def strip_caption(crop_img):
    """Surgically removes captions and nearby text letters from the cropped image."""
    h, w = crop_img.shape[:2]
    gray = cv2.cvtColor(crop_img, cv2.COLOR_BGR2GRAY)
    
    # Threshold: dark pixels become white (highlights borders, photos, and text)
    thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
    
    # Dilate 5x5: This fuses line-art and photo borders together, 
    # but the 5px reach is too small to bridge the gap to the caption text below it.
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    fused = cv2.dilate(thresh, kernel, iterations=1)
    
    contours, _ = cv2.findContours(fused, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours: return crop_img
    
    # Find the largest object (which will be the photograph or its border)
    max_area = max(cv2.contourArea(c) for c in contours)
    
    # FILTER: Keep only objects that are at least 5% the size of the main photograph.
    # This automatically throws out tiny text letters and small bullet points.
    valid_contours = [c for c in contours if cv2.contourArea(c) > (max_area * 0.05)]
    if not valid_contours: return crop_img
    
    # Draw a new bounding box tightly around only the valid image parts
    x_min, y_min = w, h
    x_max, y_max = 0, 0
    
    for c in valid_contours:
        x, y, cw, ch = cv2.boundingRect(c)
        x_min = min(x_min, x)
        y_min = min(y_min, y)
        x_max = max(x_max, x + cw)
        y_max = max(y_max, y + ch)
        
    # Add a comfortable 5px padding to the clean image
    pad = 5
    y1, y2 = max(0, y_min - pad), min(h, y_max + pad)
    x1, x2 = max(0, x_min - pad), min(w, x_max + pad)
    
    return crop_img[y1:y2, x1:x2]

def extract_visuals_from_scans(pdf_folder, output_base_folder):
    if not os.path.exists(output_base_folder): os.makedirs(output_base_folder)

    for filename in os.listdir(pdf_folder):
        if filename.lower().endswith(".pdf"):
            pdf_path = os.path.join(pdf_folder, filename)
            chapter_name = os.path.splitext(filename)[0]
            chapter_folder = os.path.join(output_base_folder, chapter_name)
            if not os.path.exists(chapter_folder): os.makedirs(chapter_folder)
                
            print(f"\nProcessing Scan: {filename}")
            pdf_file = fitz.open(pdf_path)
            
            for page_index in range(len(pdf_file)):
                page = pdf_file[page_index]
                pix = page.get_pixmap(dpi=200)
                
                img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
                if pix.n == 4: img_array = cv2.cvtColor(img_array, cv2.COLOR_RGBA2BGR)
                elif pix.n == 3: img_array = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
                else: img_array = cv2.cvtColor(img_array, cv2.COLOR_GRAY2BGR)

                aligned_img = deskew_image_robust(img_array)
                page_h, page_w = aligned_img.shape[:2]
                page_area = page_h * page_w

                gray = cv2.cvtColor(aligned_img, cv2.COLOR_BGR2GRAY)
                blurred = cv2.GaussianBlur(gray, (5, 5), 0)
                edges = cv2.Canny(blurred, 50, 150)
                
                # Loose grouping to find the general Image+Caption area
                kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 5))
                closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)
                
                contours, _ = cv2.findContours(closed.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                contours = sorted(contours, key=cv2.contourArea, reverse=True)
                
                img_count = 0
                for c in contours[:8]:
                    area = cv2.contourArea(c)
                    
                    # Use standard upright bounding box to prevent asymmetric text from causing tilts
                    x, y, w, h = cv2.boundingRect(c)
                    aspect_ratio = w / float(h)

                    margin = 0.02 
                    touches_edge = (x < page_w * margin) or (y < page_h * margin) or \
                                   (x + w > page_w * (1-margin)) or (y + h > page_h * (1-margin))

                    is_correct_size = 20000 < area < (page_area * 0.70)
                    is_correct_shape = 0.2 < aspect_ratio < 4.0

                    if not touches_edge and is_correct_size and is_correct_shape:
                        img_count += 1
                        
                        pad = 15
                        y1, y2 = max(0, y - pad), min(page_h, y + h + pad)
                        x1, x2 = max(0, x - pad), min(page_w, x + w + pad)
                        
                        # 1. Grab the loose crop (which might include the caption)
                        raw_crop = aligned_img[y1:y2, x1:x2]
                        
                        # 2. Pass it through the surgical text remover
                        clean_crop = strip_caption(raw_crop)
                        
                        save_path = os.path.join(chapter_folder, f"page_{page_index + 1}_fig_{img_count}.jpg")
                        cv2.imwrite(save_path, clean_crop, [cv2.IMWRITE_JPEG_QUALITY, 95])
                        print(f"  ✓ Page {page_index + 1}: Saved clean diagram {img_count}")

# ==========================================
SOURCE_PDF_DIR = "./chapter_pdfs"  
DESTINATION_DIR = "./extracted_scans" 

if __name__ == "__main__":
    extract_visuals_from_scans(SOURCE_PDF_DIR, DESTINATION_DIR)