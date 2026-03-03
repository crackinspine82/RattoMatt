# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Connecting to the backend

To use real subjects and chapters from the API instead of static data:

1. **Start the backend** (from repo root):
   ```bash
   cd backend && npm run dev
   ```
   The API listens on `http://0.0.0.0:3000` (reachable from your LAN).

2. **Set the API URL** in `mobile/.env`:
   - **Expo on this PC:** `EXPO_PUBLIC_API_URL=http://localhost:3000` (default).
   - **App on a physical device or another PC:** set to your backend machine’s IP, e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.10:3000`. On Windows run `ipconfig` to find “IPv4 Address”.

3. **Restart Expo** after changing `.env` (env vars are baked in at start).

4. **Optional – seed subjects** so the API returns data for your board/grade:
   ```bash
   cd backend && npm run seed:syllabus
   ```
   (Use the script that matches your syllabus JSON; see `backend/package.json` scripts. You may also need `seed:demo-student` to link a student to subjects.)

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
