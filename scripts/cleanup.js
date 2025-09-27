#!/usr/bin/env node

/**
 * 项目清理脚本
 * 用于清理不必要的文件和优化项目结构
 */

const fs = require('fs');
const path = require('path');

console.log('🧹 开始清理项目...');

// 需要清理的目录和文件
const cleanupTargets = [
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
const keepFiles = [
    '.env.example',
    'README.md',
    'package.json',
    'package-lock.json'
];

function deleteIfExists(filePath) {
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
        console.log(`❌ 删除失败 ${filePath}: ${error.message}`);
    }
}

function cleanupProject() {
    cleanupTargets.forEach(target => {
        if (target.includes('*')) {
            // 处理通配符
            const dir = path.dirname(target);
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
            deleteIfExists(target);
        }
    });
}

function checkGitIgnore() {
    const gitignorePath = '.gitignore';
    if (!fs.existsSync(gitignorePath)) {
        console.log('❌ .gitignore 文件不存在');
        return;
    }
    
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    const requiredEntries = [
        'node_modules/',
        'dist/',
        '.env',
        'logs/',
        '*.log'
    ];
    
    const missingEntries = requiredEntries.filter(entry => 
        !gitignoreContent.includes(entry)
    );
    
    if (missingEntries.length > 0) {
        console.log('⚠️  .gitignore 缺少以下条目:');
        missingEntries.forEach(entry => console.log(`   - ${entry}`));
    } else {
        console.log('✅ .gitignore 配置正确');
    }
}

function checkPackageJson() {
    const packagePath = 'package.json';
    if (!fs.existsSync(packagePath)) {
        console.log('❌ package.json 文件不存在');
        return;
    }
    
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    // 检查必要字段
    const requiredFields = ['name', 'version', 'description', 'license'];
    const missingFields = requiredFields.filter(field => !packageJson[field]);
    
    if (missingFields.length > 0) {
        console.log('⚠️  package.json 缺少以下字段:');
        missingFields.forEach(field => console.log(`   - ${field}`));
    } else {
        console.log('✅ package.json 配置完整');
    }
    
    // 检查脚本
    const recommendedScripts = ['dev', 'build', 'start', 'test'];
    const missingScripts = recommendedScripts.filter(script => 
        !packageJson.scripts || !packageJson.scripts[script]
    );
    
    if (missingScripts.length > 0) {
        console.log('⚠️  package.json 缺少以下脚本:');
        missingScripts.forEach(script => console.log(`   - ${script}`));
    } else {
        console.log('✅ package.json 脚本配置完整');
    }
}

function generateProjectStats() {
    console.log('\n📊 项目统计:');
    
    // 统计文件数量
    function countFiles(dir, extensions = []) {
        let count = 0;
        if (!fs.existsSync(dir)) return count;
        
        const files = fs.readdirSync(dir, { withFileTypes: true });
        files.forEach(file => {
            if (file.isDirectory() && file.name !== 'node_modules' && file.name !== '.git') {
                count += countFiles(path.join(dir, file.name), extensions);
            } else if (file.isFile()) {
                if (extensions.length === 0 || extensions.some(ext => file.name.endsWith(ext))) {
                    count++;
                }
            }
        });
        return count;
    }
    
    console.log(`   TypeScript文件: ${countFiles('.', ['.ts', '.tsx'])}`);
    console.log(`   JavaScript文件: ${countFiles('.', ['.js', '.jsx'])}`);
    console.log(`   JSON文件: ${countFiles('.', ['.json'])}`);
    console.log(`   Markdown文件: ${countFiles('.', ['.md'])}`);
    console.log(`   总文件数: ${countFiles('.')}`);
}

// 执行清理
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
