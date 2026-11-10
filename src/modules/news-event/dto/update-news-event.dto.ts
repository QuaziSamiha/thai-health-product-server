import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { CreateNewsEventDto } from './create-news-event.dto';
import { tryParseJson } from '../../../common/utils/json-transform.util';

//* EVERY CREATE FIELD BECOMES OPTIONAL. `images` IS RE-DECLARED BELOW
//* BECAUSE ON UPDATE IT ADDS TO THE GALLERY INSTEAD OF REPLACING IT.
export class UpdateNewsEventDto extends PartialType(
  OmitType(CreateNewsEventDto, ['images'] as const),
) {
  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description:
      'New image files to ADD to the gallery. Existing images are removed only via `deleteImageIds`. The gallery holds at most 10 images.',
  })
  @IsOptional()
  images?: Express.Multer.File[];

  @ApiPropertyOptional({
    description:
      'IDs of existing images to remove (DB rows and stored files). Send as a JSON array, or a JSON-encoded string in multipart/form-data.',
    type: [Number],
    example: [4, 7],
  })
  @IsOptional()
  @Transform(({ value }) => {
    const parsed = tryParseJson(value);
    if (typeof parsed === 'number') return [parsed];
    return Array.isArray(parsed) ? parsed.map((id) => Number(id)) : parsed;
  })
  @IsArray({ message: 'deleteImageIds must be an array' })
  @IsInt({ each: true, message: 'Each image ID must be a whole number' })
  deleteImageIds?: number[];

  @ApiPropertyOptional({
    description:
      'Which image becomes the cover: an existing image id (e.g. "12") or `new:<n>` for the nth uploaded file (0-based). If omitted and the current cover is deleted, the first remaining image becomes the cover.',
    example: 'new:0',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'number' ? String(value) : value))
  @IsString({ message: 'coverImage must be a string' })
  @Matches(/^(\d+|new:\d+)$/, {
    message: 'coverImage must be an image id or new:<index>',
  })
  coverImage?: string;
}
