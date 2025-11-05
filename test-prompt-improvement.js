/**
 * Test the improved prompt handling for "sustainable living tips" prompt
 */

const { improvePromptForVeo, generateVideoAndWait } = require('./src/geminiService');

const originalPrompt = 'Create a video about sustainable living tips.';

console.log('🧪 Testing Prompt Improvement\n');
console.log('Original prompt:');
console.log('  ', originalPrompt);
console.log();

const improvedPrompt = improvePromptForVeo(originalPrompt);
console.log('Improved prompt:');
console.log('  ', improvedPrompt);
console.log();

console.log('Explanation:');
console.log('  - Removed meta-instruction: "Create a video about"');
console.log('  - Converted to direct visual description');
console.log('  - Added cinematic qualities for better results');
console.log();

// Ask user if they want to test generation
console.log('Would you like to test video generation with this improved prompt?');
console.log('This will use real API credits. Press Ctrl+C to cancel or wait 5 seconds to continue...\n');

setTimeout(async () => {
  console.log('🎬 Starting video generation test...\n');
  
  try {
    const result = await generateVideoAndWait(originalPrompt, {
      resolution: '720p',  // Veo-3 only supports 720p and 1080p
      sampleCount: 1,
      autoImprovePrompt: true  // Enable automatic prompt improvement
    }, {
      maxRetries: 2,
      retryDelay: 10000,
      maxAttempts: 60,
      pollInterval: 5000
    });
    
    if (result.mock) {
      console.log('\n⚠️  Mock mode - configuration issue');
      console.log(result.message);
    } else if (result.status === 'COMPLETED') {
      console.log('\n✅ SUCCESS! Video generated successfully');
      console.log('Videos:', result.videos);
      if (result.successStrategy) {
        console.log('Success strategy:', result.successStrategy);
      }
    }
  } catch (err) {
    console.error('\n❌ Generation failed:', err.message);
    console.log('\nNext steps:');
    console.log('  1. Run: node diagnose-veo.js');
    console.log('  2. Check VEO_ERROR_CODE_13_GUIDE.md');
    console.log('  3. Try with an even simpler prompt:');
    console.log('     "A peaceful green forest with sunlight filtering through trees"');
  }
}, 5000);

// Also show some example transformations
console.log('═══════════════════════════════════════════════════════════');
console.log('More examples of prompt improvements:\n');

const examples = [
  'Create a video about a sunset',
  'Show me a cat playing',
  'Generate a video showing mountains',
  'Make a video of city traffic'
];

examples.forEach(example => {
  const improved = improvePromptForVeo(example);
  console.log(`Original: "${example}"`);
  console.log(`Improved: "${improved}"`);
  console.log();
});

console.log('═══════════════════════════════════════════════════════════\n');
