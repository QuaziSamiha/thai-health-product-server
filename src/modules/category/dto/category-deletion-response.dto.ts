import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { CategoryProductStatus } from '../../../generated/prisma/enums';

/**
 * Which of the two removal paths actually ran. The caller does not choose —
 * the server picks based on whether the category has ever had products filed
 * under it, because a category that has is not safely destroyable (see
 * `CategoryService.deleteCategory`).
 */
export enum CategoryDeletionAction {
  /** The row is gone. Only ever chosen for a category with no product history. */
  DELETED = 'DELETED',
  /** The row survives with `status = ARCHIVED`. Reversible from the edit form. */
  ARCHIVED = 'ARCHIVED',
}

/**
 * Outcome of `DELETE /category/delete-category/:id`. The endpoint has two
 * legitimate success shapes and the client cannot tell them apart from the
 * status code alone, so the action taken — and the counts that decided it —
 * are returned explicitly.
 */
export class CategoryDeletionResponseDto {
  @Expose()
  @ApiProperty({ description: 'ID of the category acted on', example: 12 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Name at the time of the write',
    example: 'Serums',
  })
  name!: string;

  @Expose()
  @ApiProperty({
    description: 'Slug at the time of the write',
    example: 'serums',
  })
  slug!: string;

  @Expose()
  @ApiProperty({
    enum: CategoryDeletionAction,
    enumName: 'CategoryDeletionAction',
    description:
      'What the server did. `DELETED` = row destroyed and its image files removed. `ARCHIVED` = row kept, status set to ARCHIVED, images untouched so the category can be restored.',
    example: CategoryDeletionAction.ARCHIVED,
  })
  action!: CategoryDeletionAction;

  @Expose()
  @ApiProperty({
    enum: CategoryProductStatus,
    enumName: 'CategoryProductStatus',
    nullable: true,
    description:
      'Status after the write — `ARCHIVED` on the archive path, `null` when the row no longer exists.',
    example: CategoryProductStatus.ARCHIVED,
  })
  status!: CategoryProductStatus | null;

  @Expose()
  @ApiProperty({
    description:
      'Direct sub-categories at the time of the check. Always 0 here — a category with children is rejected with a 409 rather than deleted or archived.',
    example: 0,
  })
  childrenCount!: number;

  @Expose()
  @ApiProperty({
    description:
      'Products filed directly under this category, **including soft-deleted ones**. This is the number that decides delete vs. archive: any product row at all — even a retired one — still holds the `RESTRICT` foreign key, so the category cannot be destroyed.',
    example: 14,
  })
  productCount!: number;

  @Expose()
  @ApiProperty({
    description:
      'Of those, how many are still live (`status = ACTIVE`, not soft-deleted). Reported so an admin can see what archiving this category takes off the storefront.',
    example: 11,
  })
  activeProductCount!: number;

  constructor(init: {
    id: number;
    name: string;
    slug: string;
    action: CategoryDeletionAction;
    status: CategoryProductStatus | null;
    childrenCount: number;
    productCount: number;
    activeProductCount: number;
  }) {
    this.id = init.id;
    this.name = init.name;
    this.slug = init.slug;
    this.action = init.action;
    this.status = init.status;
    this.childrenCount = init.childrenCount;
    this.productCount = init.productCount;
    this.activeProductCount = init.activeProductCount;
  }
}
