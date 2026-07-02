import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductRepository } from './product.repository';
import { ProductResponsePublicDto } from './dto/product-response.dto';

@Injectable()
export class ProductService {
  constructor(private readonly productRepository: ProductRepository) {}

  async getProductBySlug(slug: string): Promise<ProductResponsePublicDto> {
    const product = await this.productRepository.findBySlugPublic(slug);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return new ProductResponsePublicDto(product);
  }
}
