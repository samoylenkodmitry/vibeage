// Script to run the server in development mode
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

// Get the project root directory
const rootDir = process.cwd();

// Check if TypeScript is available
const tsconfigPath = path.join(rootDir, 'tsconfig.server.json');
const hasTsConfig = fs.existsSync(tsconfigPath);

// Use ts-node for TypeScript execution in development
const nodemon = require('nodemon');

nodemon({
  script: path.join(rootDir, 'server', 'server.ts'),
  ext: 'ts,tsx,js,jsx,json',
  watch: [
    path.join(rootDir, 'server'),
    path.join(rootDir, 'shared')
  ],
  exec: hasTsConfig ? 'ts-node --project tsconfig.server.json' : 'ts-node',
  env: {
    NODE_ENV: 'development',
    PORT: process.env.PORT || '3001'
  }
});

nodemon.on('start', () => {
  console.log('Server started');
});

nodemon.on('restart', (files) => {
  console.log('Server restarted due to changes in:', files);
});

nodemon.on('crash', () => {
  console.error('Server crashed, waiting for changes before restart');
});
