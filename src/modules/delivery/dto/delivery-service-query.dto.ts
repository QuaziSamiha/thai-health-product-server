import { PaginationQueryDto } from '../../../shared/pagination';

//* NO EXTRA FILTERS BEYOND THE SHARED PAGE/LIMIT/SORT-ORDER/SEARCH CONTRACT —
//* search MATCHES companyName (provider.name) AND areaName, SEE
//* DeliveryRepository.findAllRows.
export class DeliveryServiceQueryDto extends PaginationQueryDto {}
