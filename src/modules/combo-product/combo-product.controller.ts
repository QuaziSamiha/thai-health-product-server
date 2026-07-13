import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ComboProductService } from './combo-product.service';

//* NO ROUTES YET — SCAFFOLD ONLY, ENDPOINTS TO BE ADDED LATER
@ApiTags('Combo Product')
@Controller('combo-product')
export class ComboProductController {
  constructor(private readonly comboProductService: ComboProductService) {}
}
