const mysql = require("mysql2/promise");
const fs = require("fs");
require("dotenv").config();

async function run(){

 const connection = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  multipleStatements: true
 });

 await connection.query(`CREATE DATABASE IF NOT EXISTS confeitaria_saas`);

 await connection.query(`USE confeitaria_saas`);

 const sql = fs.readFileSync(
  "./src/database/migrations/001_initial_schema.sql",
  "utf8"
 );

 await connection.query(sql);

 console.log("✅ banco criado e migrations executadas");

 await connection.end();
}

run();