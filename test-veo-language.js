/**
 * Test Veo-3 Video Generation with Language Control
 * 
 * This test demonstrates how to generate videos with specific audio languages.
 * 
 * Usage:
 *   node test-veo-language.js [language]
 * 
 * Examples:
 *   node test-veo-language.js English
 *   node test-veo-language.js Spanish
 *   node test-veo-language.js French
 *   node test-veo-language.js Hindi
 */

require('dotenv').config();
const { generateVideoAndWait, improvePromptForVeo } = require('./src/geminiService');

// Test prompts
const TEST_PROMPTS = {
  'en': 'A chef preparing a gourmet meal in a modern kitchen',
  'es': 'Un chef preparando una comida gourmet en una cocina moderna',
  'fr': 'Un chef préparant un repas gastronomique dans une cuisine moderne',
  'hi': 'एक आधुनिक रसोई में एक शेफ द्वारा एक गॉरमेट भोजन तैयार करना'
};

// Language mapping
const LANGUAGES = {
  'english': 'English',
  'en': 'English',
  'spanish': 'Spanish',
  'es': 'Spanish',
  'french': 'French',
  'fr': 'French',
  'hindi': 'Hindi',
  'hi': 'Hindi',
  'german': 'German',
  'de': 'German',
  'chinese': 'Chinese',
  'zh': 'Chinese',
  'japanese': 'Japanese',
  'ja': 'Japanese',
  'arabic': 'Arabic',
  'ar': 'Arabic',
  'portuguese': 'Portuguese',
  'pt': 'Portuguese',
  'russian': 'Russian',
  'ru': 'Russian'
};

async function testVideoGeneration() {
  const languageArg = process.argv[2] || 'english';
  const language = LANGUAGES[languageArg.toLowerCase()] || 'English';
  
  // Use English prompt by default, add language specification
  const basePrompt = TEST_PROMPTS['en'];
  
  console.log('\n🎬 Veo-3 Language Test');
  console.log('='.repeat(50));
  console.log(`Language: ${language}`);
  console.log(`Base Prompt: "${basePrompt}"`);
  
  // Test prompt improvement
  console.log('\n📝 Testing Prompt Improvement...');
  const improvedPrompt = improvePromptForVeo(basePrompt, language);
  console.log(`Improved Prompt: "${improvedPrompt}"`);
  
  if (!improvedPrompt.includes(`Narration in ${language}`)) {
    console.warn(`⚠️  Warning: Language specification not found in improved prompt!`);
  } else {
    console.log(`✅ Language specification added correctly`);
  }
  
  // Check if configured for actual generation
  if (!process.env.GCP_PROJECT_ID || !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log('\n⚠️  Veo-3 not fully configured (missing GCP credentials)');
    console.log('To test actual video generation, set:');
    console.log('  - GCP_PROJECT_ID');
    console.log('  - GOOGLE_APPLICATION_CREDENTIALS');
    console.log('  - GCS_OUTPUT_BUCKET (optional)');
    return;
  }
  
  // Generate video with language specification
  console.log('\n🎥 Starting video generation...');
  console.log('This will take 2-5 minutes...');
  
  try {
    const result = await generateVideoAndWait(basePrompt, {
      resolution: '720p',
      sampleCount: 1,
      generateAudio: true,
      audioLanguage: language
    });
    
    if (result.mock) {
      console.log('\n⚠️  Mock mode - Veo not configured');
      console.log(result.message);
      return;
    }
    
    if (result.status === 'COMPLETED') {
      console.log('\n✅ Video generation completed!');
      console.log(`Generated ${result.videos.length} video(s)`);
      
      result.videos.forEach((video, i) => {
        console.log(`\nVideo ${i + 1}:`);
        console.log(`  URL: ${video.url}`);
        console.log(`  Type: ${video.type}`);
        console.log(`  MIME: ${video.mimeType}`);
      });
      
      console.log(`\n🎤 Audio should be in: ${language}`);
      console.log('Download and check the video to verify the audio language.');
    } else {
      console.error('\n❌ Video generation failed:', result.error);
    }
    
  } catch (err) {
    console.error('\n❌ Error:', err.message);
  }
}

// Run test
testVideoGeneration().catch(console.error);

console.log('\n📖 Usage Examples:');
console.log('  node test-veo-language.js English');
console.log('  node test-veo-language.js Spanish');
console.log('  node test-veo-language.js French');
console.log('  node test-veo-language.js Hindi');
console.log('  node test-veo-language.js Chinese');
console.log('\n💡 Tip: The language is added to the prompt as "Narration in [Language]"');
console.log('   Veo-3 will generate audio based on this instruction.');
