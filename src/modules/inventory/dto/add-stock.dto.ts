import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateBatchDto } from './create-batch.dto';

//* EACH ITEM IS A CreateBatchDto — SEE THAT FILE'S TOP COMMENT FOR WHY THIS
//* DOESN'T DEFINE ITS OWN, NEARLY-IDENTICAL PER-ITEM SHAPE.
export class AddStockDto {
  @ApiProperty({
    type: () => [CreateBatchDto],
    description:
      'One or more batches to add in a single call. The whole request is atomic — if any item fails, none of them are applied.',
  })
  @IsArray({ message: 'Items must be an array' })
  @ArrayMinSize(1, { message: 'Add at least one item' })
  @ValidateNested({ each: true })
  @Type(() => CreateBatchDto)
  items!: CreateBatchDto[];
}
