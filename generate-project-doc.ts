import * as fs from 'fs';
import * as path from 'path';

// Configuration
const rootDir = process.cwd();
const outputFile = path.join(rootDir, 'all_project_in_a_single_file_for_llm.txt');
const excludeDirs = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
];

const includeExtensions = [
  '.ts',
  '.tsx',
  '.md',
  'Dockerfile',
  '.json',
  '.css',
  '.sh'
];

// Skip test files unless they provide valuable documentation
const excludePatterns = [
  /\.test\./,
  /\.spec\./,
  /\.bench\./,
  /next-env\.d\.ts/,
  /tsconfig\.tsbuildinfo/,
  /package-lock\.json/,
  /pnpm-lock\.yaml/,
];

const isExcludedPath = (filePath: string): boolean => {
  const relativePath = path.relative(rootDir, filePath);
  return excludeDirs.some(dir => 
    relativePath.startsWith(dir + path.sep) || relativePath === dir
  );
};

const isExcludedFile = (filePath: string): boolean => {
  const fileName = path.basename(filePath);
  return excludePatterns.some(pattern => pattern.test(fileName));
};

const shouldIncludeFile = (filePath: string): boolean => {
  if (isExcludedPath(filePath) || isExcludedFile(filePath)) {
    return false;
  }
  
  const ext = path.extname(filePath).toLowerCase();
  return includeExtensions.includes(ext);
};

// Function to walk through directories and find all files
function walkDir(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!isExcludedPath(filePath)) {
        walkDir(filePath, fileList);
      }
    } else if (shouldIncludeFile(filePath)) {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

// Generate file content
async function generateProjectDoc() {
  console.log('Generating project documentation...');
  
  const allFiles = walkDir(rootDir);
  
  // Sort files by path for better organization
  allFiles.sort();
  
  let output = `// Project Documentation
// Generated on: ${new Date().toISOString()}
// This file contains the source code of all meaningful files in the project.

`;

  for (const filePath of allFiles) {
    // Skip the output file itself
    if (filePath === outputFile) continue;
    
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(rootDir, filePath);
      
      output += `\n\n// ${'='.repeat(78)}\n`;
      output += `// FILE: ${relativePath}\n`;
      output += `// ${'='.repeat(78)}\n\n`;
      output += fileContent;
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
    }
  }
  
  fs.writeFileSync(outputFile, output);
  console.log(`Project documentation created at: ${outputFile}`);
  console.log(`Total files included: ${allFiles.length}`);
}

// Run the script
generateProjectDoc().catch(console.error);
