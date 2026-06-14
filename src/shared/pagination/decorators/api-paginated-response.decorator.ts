import { applyDecorators, Type } from '@nestjs/common';
import { ApiOkResponse, getSchemaPath, ApiExtraModels } from '@nestjs/swagger';

export const ApiPaginatedResponse = <TModel extends Type<any>>(
  model: TModel,
) => {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      schema: {
        properties: {
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(model) },
          },
          meta: {
            type: 'object',
            properties: {
              totalItems: { type: 'number' },
              itemCount: { type: 'number' },
              itemsPerPage: { type: 'number' },
              totalPages: { type: 'number' },
              currentPage: { type: 'number' },
            },
          },
        },
      },
    }),
  );
};
