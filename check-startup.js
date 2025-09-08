const fs = require('fs');
const path = require('path');

console.log('🔍 Azure Speech Key Manager 启动检查');
console.log('=====================================');

// 检查关键文件
const criticalFiles = [
  'backend/server.ts',
  'backend/routes/upload.ts',
  'backend/types/index.ts',
  'frontend/pages/upload.tsx',
  'frontend/utils/api.ts',
  'frontend/types/index.ts',
  'frontend/components/Layout.tsx'
];

console.log('\n📁 检查关键文件:');
let allFilesExist = true;
criticalFiles.forEach(file => {
  const exists = fs.existsSync(path.join(__dirname, file));
  console.log(`${exists ? '✅' : '❌'} ${file}`);
  if (!exists) allFilesExist = false;
});

// 检查环境变量文件
console.log('\n🔧 检查环境配置:');
const envFile = path.join(__dirname, '.env');
const envExists = fs.existsSync(envFile);
console.log(`${envExists ? '✅' : '❌'} .env 文件`);
if (!envExists) {
  console.log('⚠️  请复制 .env.example 为 .env 并配置数据库连接信息');
}

// 检查依赖
console.log('\n📦 检查依赖:');
const packageJson = path.join(__dirname, 'package.json');
const frontendPackageJson = path.join(__dirname, 'frontend/package.json');

if (fs.existsSync(packageJson)) {
  console.log('✅ 后端 package.json 存在');
} else {
  console.log('❌ 后端 package.json 不存在');
  allFilesExist = false;
}

if (fs.existsSync(frontendPackageJson)) {
  console.log('✅ 前端 package.json 存在');
} else {
  console.log('❌ 前端 package.json 不存在');
  allFilesExist = false;
}

// 检查数据库初始化文件
console.log('\n🗄️  检查数据库:');
const dbInitFile = path.join(__dirname, 'database/init.sql');
if (fs.existsSync(dbInitFile)) {
  console.log('✅ 数据库初始化文件存在');
} else {
  console.log('❌ 数据库初始化文件不存在');
}

// 检查示例文件
console.log('\n📋 检查示例文件:');
const examplesDir = path.join(__dirname, 'examples');
if (fs.existsSync(examplesDir)) {
  const exampleFiles = fs.readdirSync(examplesDir);
  console.log(`✅ 示例目录存在，包含 ${exampleFiles.length} 个文件`);
  exampleFiles.forEach(file => {
    console.log(`   📄 ${file}`);
  });
} else {
  console.log('❌ 示例目录不存在');
}

// 总结
console.log('\n📊 检查结果:');
if (allFilesExist) {
  console.log('✅ 所有关键文件都存在，系统应该可以正常启动');
} else {
  console.log('❌ 发现缺失文件，请检查上述错误');
}

console.log('\n🚀 启动步骤:');
console.log('1. 确保 MySQL 和 Redis 服务正在运行');
console.log('2. 配置 .env 文件中的数据库连接信息');
console.log('3. 运行: npm run setup (首次安装)');
console.log('4. 运行: npm run dev (开发模式)');
console.log('5. 访问: http://localhost:3000');

console.log('\n🔧 如果遇到问题:');
console.log('- 检查控制台错误信息');
console.log('- 确认数据库连接正常');
console.log('- 验证端口 3000 和 3001 未被占用');
console.log('- 查看 logs 目录中的日志文件');

console.log('\n📚 更多信息请查看:');
console.log('- README.md');
console.log('- JSON_UPLOAD_GUIDE.md');
console.log('- API_QUICK_REFERENCE.md');
