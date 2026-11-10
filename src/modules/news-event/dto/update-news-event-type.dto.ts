import { PartialType } from '@nestjs/swagger';
import { CreateNewsEventTypeDto } from './create-news-event-type.dto';

//* EVERY FIELD OPTIONAL. CHANGING `name` RE-DERIVES THE SLUG.
export class UpdateNewsEventTypeDto extends PartialType(
  CreateNewsEventTypeDto,
) {}
