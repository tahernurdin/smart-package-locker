import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Auth } from '../../shared/auth/auth.decorator.js';
import { Role } from '../../shared/auth/roles.js';
import { FindOrCreateCustomerService } from '../application/find-or-create-customer.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';

interface CustomerView {
  customerId: string;
  name: string;
  email: string | null;
  phone: string | null;
}

/**
 * Customer creation is a back-office / integration concern (an order or carrier
 * feed would call this before a package is registered). No dedicated role exists
 * in the brief, so it's gated to AGENT.
 */
@Controller('customers')
@Auth(Role.Agent)
export class CustomersController {
  constructor(private readonly customers: FindOrCreateCustomerService) {}

  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreateCustomerDto): Promise<CustomerView> {
    // Idempotent on an exact email / phone match so an upstream retry doesn't
    // create a duplicate customer.
    const customer = await this.customers.findOrCreate(dto);
    return {
      customerId: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
    };
  }
}
