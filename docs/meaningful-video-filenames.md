# Meaningful Video Filenames

## Overview

AI-generated videos are now saved with descriptive filenames based on the prompt instead of generic names like `video-1762400275272-b18b2452d3e1.mp4`.

## How It Works

### Filename Generation

The system automatically generates meaningful filenames from video generation prompts by:

1. **Extracting the core subject** - Removes meta-instructions like "create a video about"
2. **Sanitizing characters** - Removes special characters and replaces spaces with hyphens
3. **Truncating long names** - Limits filename to 50 characters, breaking at word boundaries
4. **Adding uniqueness** - Appends timestamp and random string to ensure uniqueness

### Examples

| Prompt                                           | Generated Filename                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| "create a video about sustainable living tips"   | `sustainable-living-tips-1762400275272-b18b2452.mp4`                        |
| "Show me a person jogging in the park"           | `person-jogging-in-the-park-1762400275272-b18b2452.mp4`                     |
| "Chef cooking pasta in a rustic Italian kitchen" | `chef-cooking-pasta-in-a-rustic-italian-kitchen-1762400275272-b18b2452.mp4` |
| "A beautiful sunset over the ocean"              | `beautiful-sunset-over-the-ocean-1762400275272-b18b2452.mp4`                |

## Implementation Details

### Files Modified

1. **`geminiService.js`**

   - Added `generateFilenameFromPrompt()` function
   - Exported the function for use in routes

2. **`s3Service.js`**

   - Updated `uploadVideoBuffer()` to accept `customFilename` in metadata
   - Uses custom filename when provided, falls back to default pattern

3. **`routes/veo.js`**
   - Updated `/generate-and-wait` route to generate and pass custom filename
   - Updated `/download-and-upload` route to support optional prompt parameter

### API Changes

#### POST `/api/veo/generate-and-wait`

- Automatically generates meaningful filename from prompt
- No API changes required - works transparently

#### POST `/api/veo/download-and-upload`

- New optional parameter: `prompt` (string)
- If provided, generates meaningful filename from prompt
- Example:
  ```json
  {
    "gcsUri": "gs://bucket/video.mp4",
    "prompt": "sustainable living tips"
  }
  ```

## Testing

Run the test script to see example filename generation:

```bash
node test-filename-generation.js
```

## Benefits

1. **Better organization** - Easy to identify video content from filename
2. **Improved searchability** - Can search for videos by subject in file browser
3. **User-friendly** - Descriptive names are more meaningful than random strings
4. **Backward compatible** - Falls back to default pattern if no prompt provided

## Configuration

The filename generation can be customized by modifying the `generateFilenameFromPrompt()` function in `geminiService.js`:

- `maxLength` - Maximum filename length (default: 50 characters)
- Regex patterns - Customize which phrases to remove from prompts
- Fallback name - Default name when prompt is too short (default: "ai-video")
