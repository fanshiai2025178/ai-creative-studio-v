import 'dotenv/config';
import mysql from 'mysql2/promise';

const url = new URL(process.env.DATABASE_URL);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: url.port || 4000,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1).split('?')[0],
  ssl: { rejectUnauthorized: true }
});

const [rows] = await conn.execute("SELECT id, JSON_EXTRACT(characters, '$[0].name') as char_name, JSON_EXTRACT(characters, '$[0].imageUrl') as char_image FROM designs ORDER BY id DESC LIMIT 3");
console.log('=== 角色图片 URL ===');
rows.forEach(r => console.log(`ID ${r.id}: ${r.char_name} -> ${r.char_image}`));

await conn.end();
