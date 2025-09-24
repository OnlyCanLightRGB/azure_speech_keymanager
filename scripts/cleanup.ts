#!/usr/bin/env node

/**
 * 项目清理脚本
 * 用于清理不必要的文件和优化项目结构
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧹 开始清理项目...');

// 需要清理的目录和文件
const cleanupTargets: string[] = [
    'logs',
    'dist',
    'frontend/.next',
    'frontend/out',
    'tests/__pycache__',
    'node_modules/.cache',
    '*.log',
    'dump.rdb'
];

// 需要保留的重要文件
const keepFiles: string[] = [
    '.env.example',
    'README.md',
    'package.json',
    'package-lock.json'
];

function deleteIfExists(filePath: string): void {
    try {
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) {
                fs.rmSync(filePath, { recursive: true, force: true });
                console.log(`✅ 删除目录: ${filePath}`);
            } else {
                fs.unlinkSync(filePath);
                console.log(`✅ 删除文件: ${filePath}`);
            }
        }
    } catch (error) {
        console.log(`❌ 删除失败 ${filePath}: ${(error as Error).message}`);
    }
}

function cleanupProject(): void {
    const projectRoot = path.join(__dirname, '..');
    
    cleanupTargets.forEach(target => {
        const targetPath = path.join(projectRoot, target);
        
        // 处理通配符文件
        if (target.includes('*')) {
            const dir = path.dirname(targetPath);
            const pattern = path.basename(target);
            
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir);
                files.forEach(file => {
                    if (file.match(pattern.replace('*', '.*'))) {
                        deleteIfExists(path.join(dir, file));
                    }
                });
            }
        } else {
            deleteIfExists(targetPath);
        }
    });
}

function checkGitIgnore(): void {
    const gitignorePath = path.join(__dirname, '..', '.gitignore');
    
    if (!fs.existsSync(gitignorePath)) {
        console.log('⚠️  .gitignore 文件不存在');
        return;
    }
    
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    const requiredEntries = [
        'node_modules/',
        '.env',
        'dist/',
        'logs/',
        '*.log',
        '.DS_Store'
    ];
    
    const missingEntries = requiredEntries.filter(entry => 
        !gitignoreContent.includes(entry)
    );
    
    if (missingEntries.length > 0) {
        console.log('⚠️  .gitignore 缺少以下条目:');
        missingEntries.forEach(entry => console.log(`   - ${entry}`));
    } else {
        console.log('✅ .gitignore 配置完整');
    }
}

function checkPackageJson(): void {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
        console.log('❌ package.json 文件不存在');
        return;
    }
    
    try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        // 检查必要的脚本
        const requiredScripts = ['start', 'build', 'dev', 'test'];
        const missingScripts = requiredScripts.filter(script => 
            !packageJson.scripts || !packageJson.scripts[script]
        );
        
        if (missingScripts.length > 0) {
            console.log('⚠️  package.json 缺少以下脚本:');
            missingScripts.forEach(script => console.log(`   - ${script}`));
        } else {
            console.log('✅ package.json 脚本配置完整');
        }
        
        // 检查基本信息
        const requiredFields = ['name', 'version', 'description'];
        const missingFields = requiredFields.filter(field => !packageJson[field]);
        
        if (missingFields.length > 0) {
            console.log('⚠️  package.json 缺少以下字段:');
            missingFields.forEach(field => console.log(`   - ${field}`));
        }
        
    } catch (error) {
        console.log(`❌ 解析 package.json 失败: ${(error as Error).message}`);
    }
}

function generateProjectStats(): void {
    const projectRoot = path.join(__dirname, '..');
    
    try {
        // 统计文件数量
        let totalFiles = 0;
        let totalSize = 0;
        
        function countFiles(dir: string): void {
            const items = fs.readdirSync(dir);
            
            items.forEach(item => {
                const itemPath = path.join(dir, item);
                const stats = fs.statSync(itemPath);
                
                if (stats.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
                    countFiles(itemPath);
                } else if (stats.isFile()) {
                    totalFiles++;
                    totalSize += stats.size;
                }
            });
        }
        
        countFiles(projectRoot);
        
        console.log('\n📊 项目统计:');
        console.log(`   文件总数: ${totalFiles}`);
        console.log(`   总大小: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
        
    } catch (error) {
        console.log(`❌ 生成项目统计失败: ${(error as Error).message}`);
    }
}

// 执行清理流程
console.log('🧹 清理临时文件和构建产物...');
cleanupProject();

console.log('\n🔍 检查项目配置...');
checkGitIgnore();
checkPackageJson();

generateProjectStats();

console.log('\n✨ 项目清理完成！');
console.log('\n📝 下一步操作:');
console.log('1. 检查 .env.example 文件是否包含所有必要的环境变量');
console.log('2. 确认 README.md 文档是否完整');
console.log('3. 运行 npm test 确保所有测试通过');
console.log('4. 运行 npm run build 确保项目可以正常构建');
console.log('5. 提交代码到Git仓库');
console.log('6. 推送到GitHub并创建Release');