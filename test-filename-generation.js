/**
 * Test script for filename generation from prompts
 */

const { generateFilenameFromPrompt } = require('./src/geminiService');

// Test cases
const testPrompts = [
  "create a video about sustainable living tips",
  "A beautiful sunset over the ocean",
  "Show me a person jogging in the park",
  "Generate a video of a cat playing with yarn",
  "Make a video showing modern architecture in the city",
  "person gardening in community garden with solar panels",
  "Chef cooking pasta in a rustic Italian kitchen with natural light",
  "Very long prompt that should be truncated because it exceeds the maximum allowed length for filename generation and we need to test this scenario",
  "Video!@#$%^&*() with special characters!!!",
  "create",
  "",
  "ai"
];

console.log('Testing filename generation from prompts:\n');
console.log('='.repeat(80));

testPrompts.forEach((prompt, index) => {
  const filename = generateFilenameFromPrompt(prompt);
  const fullFilename = `${filename}-1762400275272-b18b2452.mp4`;
  
  console.log(`\nTest ${index + 1}:`);
  console.log(`Prompt: "${prompt}"`);
  console.log(`Generated filename: ${filename}`);
  console.log(`Full S3 filename: ${fullFilename}`);
  console.log('-'.repeat(80));
});

console.log('\n✅ All tests completed!');
