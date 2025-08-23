import { extractStyleSample, mergeStyles } from '../src/lib/style-extractor';

// Test the style extractor
const testEmails = [
  "Hi John,\n\nThanks for reaching out! I'd love to chat about this. Let's grab a time next week.\n\nCheers,\nAlex",
  
  "Hey Sarah,\n\nThis looks really interesting! I'm excited to learn more about your project. Would you be open to a quick call?\n\nBest regards,\nAlex",
  
  "Hello there,\n\nI appreciate you taking the time to review this proposal. It's been a pleasure working with your team.\n\nThank you,\nAlex"
];

console.log("Testing Style Extractor\n");

testEmails.forEach((email, i) => {
  console.log(`Email ${i + 1}:`);
  console.log(email);
  console.log("\nExtracted Style:");
  const style = extractStyleSample(email);
  console.log(JSON.stringify(style, null, 2));
  console.log("\n" + "=".repeat(50) + "\n");
});

// Test style merging
console.log("Testing Style Merging\n");
const style1 = extractStyleSample(testEmails[0]);
const style2 = extractStyleSample(testEmails[1]);
const merged = mergeStyles(style1, style2);

console.log("Style 1:", JSON.stringify(style1, null, 2));
console.log("Style 2:", JSON.stringify(style2, null, 2));
console.log("Merged:", JSON.stringify(merged, null, 2)); 