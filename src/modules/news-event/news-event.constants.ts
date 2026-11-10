import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

export const NEWS_EVENT_IMAGE_FOLDER = 'news-events/images';

export const NEWS_EVENT_MAX_IMAGES = 10;

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; //* 5 MB PER FILE

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

//* MULTER REJECTS NON-IMAGES AND OVERSIZED FILES BEFORE THEY REACH THE
//* SERVICE, SO NOTHING UNTRUSTED IS EVER WRITTEN TO STORAGE.
export const NEWS_EVENT_IMAGE_UPLOAD_OPTIONS: MulterOptions = {
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES, files: NEWS_EVENT_MAX_IMAGES },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      return callback(
        new BadRequestException(
          'Only JPEG, PNG, WEBP, GIF or AVIF images are allowed',
        ),
        false,
      );
    }
    callback(null, true);
  },
};

//* PREFIX FOR A NEWLY UPLOADED IMAGE IN `coverImage` ON UPDATE, E.G. "new:0"
export const NEW_IMAGE_REF_PREFIX = 'new:';

export const RELATED_NEWS_EVENTS_DEFAULT_LIMIT = 3;
export const RELATED_NEWS_EVENTS_MAX_LIMIT = 12;
