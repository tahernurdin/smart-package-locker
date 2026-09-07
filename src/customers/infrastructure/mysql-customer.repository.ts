import { Inject, Injectable } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { MYSQL_POOL } from '../../shared/database/mysql.pool.js';
import { Customer } from '../domain/customer.entity.js';
import type {
  CustomerContact,
  CustomerRepository,
} from '../domain/customer.repository.js';

@Injectable()
export class MysqlCustomerRepository implements CustomerRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async findById(id: string): Promise<Customer | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, name, email, phone, created_at FROM customer WHERE id = :id LIMIT 1`,
      { id },
    );
    return rows.length ? this.toCustomer(rows[0]) : null;
  }

  async findByContact(contact: CustomerContact): Promise<Customer | null> {
    const email = contact.email?.trim() || null;
    const phone = contact.phone?.trim() || null;
    if (!email && !phone) return null;

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, name, email, phone, created_at
       FROM customer
       WHERE (:email IS NOT NULL AND email = :email)
          OR (:phone IS NOT NULL AND phone = :phone)
       ORDER BY (email <=> :email) DESC
       LIMIT 1`,
      { email, phone },
    );
    return rows.length ? this.toCustomer(rows[0]) : null;
  }

  async save(customer: Customer): Promise<void> {
    await this.pool.query(
      `INSERT INTO customer (id, name, email, phone, created_at)
       VALUES (:id, :name, :email, :phone, :createdAt)`,
      {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        createdAt: customer.createdAt,
      },
    );
  }

  private toCustomer(row: RowDataPacket): Customer {
    return Customer.fromPersistence({
      id: row.id as string,
      name: row.name as string,
      email: (row.email as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      createdAt: row.created_at as Date,
    });
  }
}
