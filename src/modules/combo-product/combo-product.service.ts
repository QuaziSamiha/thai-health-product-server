import { Injectable } from '@nestjs/common';
import { ComboProductRepository } from './combo-product.repository';

@Injectable()
export class ComboProductService {
  constructor(
    private readonly comboProductRepository: ComboProductRepository,
  ) {}
}
