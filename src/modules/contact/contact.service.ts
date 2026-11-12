import { Injectable, NotFoundException } from '@nestjs/common';
import { IPaginatedResult } from '../../shared/pagination';
import { ContactRepository, ContactMessageRow } from './contact.repository';
import {
  ContactMessageQueryDto,
  CreateContactMessageDto,
  UpdateContactInfoDto,
} from './dto/contact.dto';

@Injectable()
export class ContactService {
  constructor(private readonly contactRepository: ContactRepository) {}

  // ─── Contact Info ──────────────────────────────────────────────────────────

  //* null UNTIL AN ADMIN SAVES IT FOR THE FIRST TIME — THE CLIENT SHOWS "—"
  getInfo() {
    return this.contactRepository.findInfo();
  }

  //* FIRST SAVE CREATES THE ROW (createdBy + updatedBy = THIS ADMIN), LATER
  //* SAVES UPDATE IT (updatedBy = THIS ADMIN)
  updateInfo(userId: number, dto: UpdateContactInfoDto) {
    return this.contactRepository.upsertInfo(userId, dto);
  }

  // ─── Contact Message ───────────────────────────────────────────────────────

  createMessage(dto: CreateContactMessageDto) {
    return this.contactRepository.createMessage(dto);
  }

  getAllMessages(
    params: ContactMessageQueryDto,
  ): Promise<IPaginatedResult<ContactMessageRow>> {
    return this.contactRepository.findAllMessages(params);
  }

  //* OPENING A MESSAGE MARKS IT READ
  async getMessageById(id: number) {
    const message = await this.findMessageOrThrow(id);
    if (message.isRead) return message;
    return this.contactRepository.markMessageRead(id);
  }

  async markMessageRead(id: number) {
    await this.findMessageOrThrow(id);
    return this.contactRepository.markMessageRead(id);
  }

  async deleteMessage(id: number) {
    await this.findMessageOrThrow(id);
    return this.contactRepository.deleteMessage(id);
  }

  private async findMessageOrThrow(id: number) {
    const message = await this.contactRepository.findMessageById(id);
    if (!message) {
      throw new NotFoundException(`Contact message with ID ${id} not found`);
    }
    return message;
  }
}
