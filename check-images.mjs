import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);

// 检查角色图片
const [characters] = await conn.execute('SELECT id, name, imageUrl FROM design_characters ORDER BY id DESC LIMIT 5');
console.log('=== 角色图片 ===');
characters.forEach(c => console.log(`${c.name}: ${c.imageUrl || '(无图片)'}`));

// 检查场景图片
const [scenes] = await conn.execute('SELECT id, name, imageUrl FROM design_scenes ORDER BY id DESC LIMIT 5');
console.log('\n=== 场景图片 ===');
scenes.forEach(s => console.log(`${s.name}: ${s.imageUrl || '(无图片)'}`));

await conn.end();
