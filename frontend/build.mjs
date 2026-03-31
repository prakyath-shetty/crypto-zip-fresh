import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const backendOrigin = process.env.FRONTEND_API_ORIGIN || 'https://your-render-app.onrender.com';
const frontendUrl = process.env.FRONTEND_PUBLIC_URL || 'https://your-vercel-app.vercel.app';
const firebaseApiKey = process.env.FIREBASE_API_KEY || '__FIREBASE_API_KEY__';
const firebaseAuthDomain = process.env.FIREBASE_AUTH_DOMAIN || '__FIREBASE_AUTH_DOMAIN__';
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || '__FIREBASE_PROJECT_ID__';
const firebaseStorageBucket = process.env.FIREBASE_STORAGE_BUCKET || '__FIREBASE_STORAGE_BUCKET__';
const firebaseMessagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID || '__FIREBASE_MESSAGING_SENDER_ID__';
const firebaseAppId = process.env.FIREBASE_APP_ID || '__FIREBASE_APP_ID__';
const firebaseMeasurementId = process.env.FIREBASE_MEASUREMENT_ID || '__FIREBASE_MEASUREMENT_ID__';
const sourceBackendOrigin = 'https://crypto-backend-d9v8.onrender.com';
const sourceFrontendUrl = 'https://crypto-frontend-app-six.vercel.app';

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name === 'package.json' || entry.name === 'build.mjs') {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
      continue;
    }

    await cp(srcPath, destPath);

    if (/\.(html|js|css)$/i.test(entry.name)) {
      const content = await readFile(destPath, 'utf8');
      const updated = content
        .replaceAll(sourceBackendOrigin, backendOrigin)
        .replaceAll(sourceFrontendUrl, frontendUrl)
        .replaceAll('__FIREBASE_API_KEY__', firebaseApiKey)
        .replaceAll('__FIREBASE_AUTH_DOMAIN__', firebaseAuthDomain)
        .replaceAll('__FIREBASE_PROJECT_ID__', firebaseProjectId)
        .replaceAll('__FIREBASE_STORAGE_BUCKET__', firebaseStorageBucket)
        .replaceAll('__FIREBASE_MESSAGING_SENDER_ID__', firebaseMessagingSenderId)
        .replaceAll('__FIREBASE_APP_ID__', firebaseAppId)
        .replaceAll('__FIREBASE_MEASUREMENT_ID__', firebaseMeasurementId);
      await writeFile(destPath, updated, 'utf8');
    }
  }
}

await copyDir(root, distDir);
await writeFile(
  path.join(distDir, 'vercel.json'),
  JSON.stringify({ cleanUrls: false }, null, 2),
  'utf8'
);

const stats = await stat(path.join(distDir, 'index.html'));
if (!stats.isFile()) {
  throw new Error('Build failed: dist/index.html was not created');
}

console.log(`Frontend build complete in ${distDir}`);
