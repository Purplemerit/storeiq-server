# Backend API Documentation

This document describes the REST API endpoints for the backend services in the `server/` directory. All endpoints return JSON responses and use standard HTTP status codes.

---

## Table of Contents

- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [API Groups](#api-groups)
  - [AI](#ai)
  - [Auth](#auth)
  - [Video](#video)
  - [Publish](#publish)
  - [Stats](#stats)
- [Middleware](#middleware)
- [Request/Response Format](#requestresponse-format)
- [Standard Error Codes](#standard-error-codes)
- [Usage Notes](#usage-notes)

---

## Authentication

- **Type:** JWT-based authentication.
- **How:** On successful login/register, a JWT is set as an HTTP-only cookie.
- **Validation:** Protected endpoints require the `authMiddleware` to validate the JWT.
- **OAuth:** YouTube/Instagram OAuth tokens are stored per user for publishing.

---

## Error Handling

- All errors return JSON objects:  
  `{ "error": "message" }`
- Input validation and resource ownership checks are enforced.
- File upload errors are handled by `multer`.

---

## API Groups

### AI

Endpoints for AI-powered script, video, and image generation/editing.

| Method | Path                        | Description                               | Auth Required | Request Body / Params | Response Schema         |
|--------|-----------------------------|-------------------------------------------|---------------|----------------------|------------------------|
| POST   | `/api/ai/script`            | Generate a script from prompt             | No            | `{ prompt: string }` | `{ script: string }`   |
| POST   | `/api/ai/video`             | Generate a video from script or prompt    | Yes           | `{ script: string }` | `{ videoUrl: string }` |
| POST   | `/api/ai/image`             | Generate an image from prompt             | No            | `{ prompt: string }` | `{ imageUrl: string }` |
| POST   | `/api/ai/image/edit`        | Edit an image                             | Yes           | `{ image, edits }`   | `{ imageUrl: string }` |
| GET    | `/api/ai/tools`             | List available AI tools                   | No            | -                    | `{ tools: [...] }`     |

---

### Auth

User registration, login, user info, password management, and social linking.

| Method | Path                        | Description                               | Auth Required | Request Body / Params           | Response Schema         |
|--------|-----------------------------|-------------------------------------------|---------------|----------------------------------|------------------------|
| POST   | `/api/auth/register`        | Register a new user                       | No            | `{ email, password }`           | `{ user, token }`      |
| POST   | `/api/auth/login`           | Login user, sets JWT cookie               | No            | `{ email, password }`           | `{ user, token }`      |
| GET    | `/api/auth/me`              | Get current user info                     | Yes           | -                              | `{ user }`             |
| POST   | `/api/auth/logout`          | Logout user, clears JWT cookie            | Yes           | -                              | `{ success: true }`    |
| POST   | `/api/auth/password`        | Change password                           | Yes           | `{ oldPassword, newPassword }`  | `{ success: true }`    |
| POST   | `/api/auth/youtube/link`    | Link YouTube account (OAuth)              | Yes           | `{ code }`                      | `{ success: true }`    |
| POST   | `/api/auth/instagram/link`  | Link Instagram account (OAuth)            | Yes           | `{ code }`                      | `{ success: true }`    |

---

### Video

Video CRUD, S3 upload, cropping, and listing.

| Method | Path                              | Description                                 | Auth Required | Request Body / Params           | Response Schema         |
|--------|-----------------------------------|---------------------------------------------|---------------|----------------------------------|------------------------|
| POST   | `/api/video`                      | Create a new video                          | Yes           | `{ title, ... }`                | `{ video }`            |
| GET    | `/api/video/:id`                  | Get video by ID                             | Yes           | URL param: `id`                 | `{ video }`            |
| PUT    | `/api/video/:id`                  | Update video metadata                       | Yes           | `{ ... }`                       | `{ video }`            |
| DELETE | `/api/video/:id`                  | Delete video                                | Yes           | URL param: `id`                 | `{ success: true }`    |
| GET    | `/api/video`                      | List all user videos                        | Yes           | -                              | `{ videos: [...] }`    |
| POST   | `/api/video/upload`               | Upload video file (single/multipart, S3)    | Yes           | `multipart/form-data`           | `{ videoUrl }`         |
| POST   | `/api/video/crop`                 | Start crop job                              | Yes           | `{ videoId, cropParams }`       | `{ jobId }`            |
| GET    | `/api/video/crop/status/:jobId`   | Get crop job status                         | No            | URL param: `jobId`              | `{ status, result }`   |

---

### Publish

Publish videos to YouTube or Instagram.

| Method | Path                              | Description                                 | Auth Required | Request Body / Params           | Response Schema         |
|--------|-----------------------------------|---------------------------------------------|---------------|----------------------------------|------------------------|
| POST   | `/api/publish/youtube`            | Publish video to YouTube                    | Yes           | `{ videoId, ... }`              | `{ success: true }`    |
| POST   | `/api/publish/instagram`          | Publish video to Instagram                  | Yes           | `{ videoId, ... }`              | `{ success: true }`    |

---

### Stats

User-specific summary and timeseries statistics.

| Method | Path                              | Description                                 | Auth Required | Request Body / Params           | Response Schema         |
|--------|-----------------------------------|---------------------------------------------|---------------|----------------------------------|------------------------|
| GET    | `/api/stats/summary`              | Get user summary stats                      | Yes           | -                              | `{ summary: {...} }`   |
| GET    | `/api/stats/timeseries`           | Get user timeseries stats                   | Yes           | -                              | `{ timeseries: [...]}` |

---

## Middleware

- **authMiddleware:** Validates JWT for protected endpoints.
- **multer:** Handles file uploads.
- **Custom S3 logic:** For multipart uploads.

---

## Request/Response Format

- **Request:** JSON body unless otherwise specified (e.g., file uploads use `multipart/form-data`).
- **Response:** All responses are JSON.
- **Error:**  
  ```json
  { "error": "message" }
  ```

---

## Standard Error Codes

| Code | Meaning                |
|------|------------------------|
| 400  | Bad Request            |
| 401  | Unauthorized           |
| 403  | Forbidden              |
| 404  | Not Found              |
| 409  | Conflict               |
| 413  | Payload Too Large      |
| 500  | Internal Server Error  |

---

## Usage Notes

- All endpoints are prefixed with `/api/`.
- For protected endpoints, ensure the JWT cookie is present.
- OAuth linking for YouTube/Instagram requires user interaction.
- File uploads must use `multipart/form-data`.
- Ownership and input validation are enforced on all protected resources.
- Crop job status endpoint is public for polling by unauthenticated clients.
