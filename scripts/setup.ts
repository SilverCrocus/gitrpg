#!/usr/bin/env npx ts-node

/**
 * GitRPG Setup Script
 *
 * Validates environment configuration and initializes the project.
 * Run with: npm run setup
 */

import { initializeFirebase } from '../src/services/firebase';

interface FirebaseEnvConfig {
  apiKey: string | undefined;
  authDomain: string | undefined;
  projectId: string | undefined;
  storageBucket: string | undefined;
  messagingSenderId: string | undefined;
  appId: string | undefined;
}

function getFirebaseConfig(): FirebaseEnvConfig {
  return {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
  };
}

function validateFirebaseConfig(config: FirebaseEnvConfig): boolean {
  const requiredFields: (keyof FirebaseEnvConfig)[] = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId'
  ];

  const missingFields = requiredFields.filter(field => !config[field]);

  if (missingFields.length > 0) {
    console.log('\n⚠️  Firebase configuration incomplete.\n');
    console.log('Missing environment variables:');
    missingFields.forEach(field => {
      const envName = `FIREBASE_${field.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
      console.log(`  - ${envName}`);
    });
    console.log('\nTo set up Firebase:');
    console.log('1. Create a Firebase project at https://console.firebase.google.com');
    console.log('2. Enable Firestore and Authentication');
    console.log('3. Get your web app config from Project Settings');
    console.log('4. Set the environment variables listed above');
    console.log('\nExample .env file:');
    console.log('  FIREBASE_API_KEY=your-api-key');
    console.log('  FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com');
    console.log('  FIREBASE_PROJECT_ID=your-project-id');
    console.log('  FIREBASE_STORAGE_BUCKET=your-project.appspot.com');
    console.log('  FIREBASE_MESSAGING_SENDER_ID=123456789');
    console.log('  FIREBASE_APP_ID=1:123456789:web:abc123');
    return false;
  }

  return true;
}

async function setup() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║           GitRPG Setup Script          ║');
  console.log('╚════════════════════════════════════════╝\n');

  // Check Firebase config
  const firebaseConfig = getFirebaseConfig();
  const hasValidConfig = validateFirebaseConfig(firebaseConfig);

  if (hasValidConfig) {
    console.log('✅ Firebase configuration found\n');

    try {
      console.log('Initializing Firebase...');
      initializeFirebase(firebaseConfig as Required<FirebaseEnvConfig>);
      console.log('✅ Firebase initialized successfully\n');
    } catch (error) {
      console.error('❌ Firebase initialization failed:', error);
      process.exit(1);
    }
  }

  // Print next steps
  console.log('\n📋 Setup Status:');
  console.log('────────────────────────────────────────');
  console.log(`  Firebase Config: ${hasValidConfig ? '✅ Ready' : '⚠️  Needs configuration'}`);
  console.log('');

  console.log('\n🚀 Next Steps:');
  console.log('────────────────────────────────────────');

  if (!hasValidConfig) {
    console.log('1. Set up Firebase (see instructions above)');
    console.log('2. Run this setup script again');
  } else {
    console.log('1. Run the VSCode extension:');
    console.log('   cd extension && npm install && npm run compile');
    console.log('   Then press F5 in VSCode to launch extension host\n');

    console.log('2. Run the web dashboard:');
    console.log('   cd dashboard && npm install && npm run dev\n');

    console.log('3. Run tests:');
    console.log('   npm test\n');
  }

  console.log('\n📖 Documentation:');
  console.log('────────────────────────────────────────');
  console.log('  - Implementation plans: docs/plans/');
  console.log('  - Extension source: extension/src/');
  console.log('  - Dashboard source: dashboard/src/');
  console.log('  - Backend services: src/services/');
  console.log('');
}

setup().catch(error => {
  console.error('Setup failed:', error);
  process.exit(1);
});
