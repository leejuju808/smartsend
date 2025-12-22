import { writeFileSync } from "fs";

const N = parseInt(process.env.N || "250", 10);
let out = "email,first_name,last_name,company\n";
for (let i = 0; i < N; i++) {
  out += `user${i}@example.com,F${i},L${i},Company ${Math.floor(i / 5)}\n`;
}
writeFileSync("seeds/bulk_leads.csv", out);
console.log(`Wrote seeds/bulk_leads.csv with ${N} rows`);

