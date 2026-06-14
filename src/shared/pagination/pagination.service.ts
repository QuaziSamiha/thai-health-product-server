import { Injectable } from '@nestjs/common';
import { PaginationParamsDto } from './dto/pagination-params.dto';
import {
  IPaginatedResult,
  TPrismaModelDelegate,
} from './interfaces/pagination.interface';

@Injectable()
export class PaginationService {
  /**
   * GOAL: ELIMINATE UNSAFE CALL ERRORS BY USING A STRICT DELEGATE TYPE.
   */
  async paginate<T>(
    model: TPrismaModelDelegate<T>, // USE THE NEW TYPE HERE
    params: PaginationParamsDto,
    options: {
      where?: Record<string, any>;
      include?: Record<string, any>;
      select?: Record<string, any>;
      searchableFields?: string[];
      defaultSortField?: string;
    } = {},
  ): Promise<IPaginatedResult<T>> {
    const { page, limit, sortOrder, search } = params;
    const {
      where = {},
      include,
      select,
      searchableFields = [],
      defaultSortField = 'createdAt',
    } = options;

    const searchCondition: Record<string, any> =
      search && searchableFields.length > 0
        ? {
            OR: searchableFields.map((field) => {
              const parts = field.split('.');
              let condition: Record<string, any> = {
                [parts[parts.length - 1]]: {
                  contains: search,
                  mode: 'insensitive',
                },
              };
              for (let i = parts.length - 2; i >= 0; i--) {
                condition = { [parts[i]]: condition };
              }
              return condition;
            }),
          }
        : {};

    const combinedWhere = { ...where, ...searchCondition };

    const [totalItems, data] = await Promise.all([
      model.count({ where: combinedWhere }),
      model.findMany({
        where: combinedWhere,
        include,
        select,
        skip: page && limit ? (page - 1) * limit : undefined,
        take: limit ? limit : undefined,
        orderBy: { [defaultSortField]: sortOrder },
      }),
    ]);

    const itemsPerPage = limit || totalItems;
    const currentPage = page || 1;

    return {
      data,
      meta: {
        totalItems,
        itemCount: data.length,
        itemsPerPage,
        totalPages: Math.ceil(totalItems / itemsPerPage) || 1,
        currentPage,
      },
    };
  }
}
