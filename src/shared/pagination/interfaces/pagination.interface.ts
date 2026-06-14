/**
 * GOAL: STANDARDIZE METADATA FOR UI PAGINATION CONTROLS.
 */
export interface IPaginationMeta {
  totalItems: number; // TOTAL RECORDS MATCHING THE FILTER IN THE DATABASE.
  itemCount: number; // NUMBER OF RECORDS RETURNED IN THE CURRENT DATA ARRAY.
  itemsPerPage: number; // MAXIMUM RECORDS PERMITTED PER PAGE (LIMIT).
  totalPages: number; // TOTAL NAVIGABLE PAGES (TOTAL ITEMS / ITEMS PER PAGE).
  currentPage: number; // CURRENT ACTIVE PAGE OFFSET (1-BASED INDEX).
}

/**
 * GOAL: UNIFIED WRAPPER FOR ALL PAGINATED API RESPONSES.
 * T: GENERIC ENTITY TYPE (E.G., PRODUCT, USER, ORDER).
 */
export interface IPaginatedResult<T> {
  data: T[]; // ARRAY OF TYPE-SAFE ENTITIES RETURNED BY THE QUERY.
  meta: IPaginationMeta; // STANDARDIZED METADATA FOR THE CURRENT REQUEST.
}

/**
 * GOAL: DEFINE A STRICT TYPE THAT MATCHES PRISMA'S INTERNAL DELEGATE STRUCTURE.
 */
export type TPrismaModelDelegate<T> = {
  count: (args: { where?: any }) => Promise<number>;
  findMany: (args: {
    where?: any;
    include?: any;
    select?: any;
    take?: number;
    skip?: number;
    orderBy?: any;
  }) => Promise<T[]>;
};
