// src/data-import/data-import.service.ts

import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Apartment } from './entities/apartment.entity';
import { Balance } from './entities/balance.entity';

export type Mode = 'append' | 'replace';

export interface ImportResult {
  residentsImported: number;
  apartmentsImported: number;
  balancesImported: number;
  errors: string[];
}

@Injectable()
export class DataImportService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Apartment) private readonly apartmentRepo: Repository<Apartment>,
    @InjectRepository(Balance) private readonly balanceRepo: Repository<Balance>,
  ) {}

  async importFromExcel(file: Express.Multer.File, opts: { mode: Mode }): Promise<ImportResult> {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });

    const residentsSheet = workbook.Sheets['Residents'];
    const apartmentsSheet = workbook.Sheets['Apartments'];
    const balancesSheet = workbook.Sheets['Balances'];

    if (!residentsSheet || !apartmentsSheet || !balancesSheet) {
      throw new BadRequestException(
        'Ожидаются листы: Residents, Apartments, Balances. Проверьте шаблон.',
      );
    }

    const residents = XLSX.utils.sheet_to_json<any>(residentsSheet);
    const apartments = XLSX.utils.sheet_to_json<any>(apartmentsSheet);
    const balances = XLSX.utils.sheet_to_json<any>(balancesSheet);

    const errors: string[] = [];

    return this.dataSource.transaction(async (manager) => {
      if (opts.mode === 'replace') {
        await manager.clear(Balance);
        await manager.clear(Apartment);
      }

      let residentsImported = 0;
      for (const r of residents) {
        const email = (r['email'] ?? '').toString().trim();
        if (!email) {
          errors.push('Пустой email в Residents.');
          continue;
        }

        let user = await manager.findOne(User, { where: { email } });
        if (!user) {
          user = manager.create(User, {
            email,
            passwordHash: 'temp', // 👇 ИСПРАВЛЕНО (было password_hash)
            tariff: r['tariff'] || 'Базовый',
            fullName: r['full_name'] || null, // 👇 ИСПРАВЛЕНО (было full_name)
            phone: r['phone'] || null,
          });
        } else {
          // 👇 ИСПРАВЛЕНО (было full_name)
          user.fullName = r['full_name'] ?? user.fullName;
          user.phone = r['phone'] ?? user.phone;
          user.tariff = r['tariff'] ?? user.tariff;
        }
        await manager.save(User, user);
        residentsImported++;
      }

      let apartmentsImported = 0;
      for (const a of apartments) {
        const number = (a['number'] ?? '').toString().trim();
        if (!number) {
          errors.push('Пустой number в Apartments.');
          continue;
        }

        const address = (a['address'] ?? '').toString().trim();
        let apartment = await manager.findOne(Apartment, { where: { number } });
        if (!apartment) {
          apartment = manager.create(Apartment, { number, address });
        } else {
          apartment.address = address || apartment.address;
        }
        await manager.save(Apartment, apartment);
        apartmentsImported++;
      }

      let balancesImported = 0;
      for (const b of balances) {
        const aptNumber = (b['apartment_number'] ?? '').toString().trim();
        if (!aptNumber) {
          errors.push('Пустой apartment_number в Balances.');
          continue;
        }

        const apartment = await manager.findOne(Apartment, { where: { number: aptNumber } });
        if (!apartment) {
          errors.push(`Квартира не найдена: ${aptNumber}.`);
          continue;
        }

        const amount = Number(b['amount'] ?? 0);
        const as_of_date = this.parseDateField(b['as_of_date']) ?? this.todayISO();

        const balance = manager.create(Balance, {
          apartment,
          amount: amount.toFixed(2),
          as_of_date,
        });
        await manager.save(Balance, balance);
        balancesImported++;
      }

      return {
        residentsImported,
        apartmentsImported,
        balancesImported,
        errors,
      };
    });
  }

  private parseDateField(v: any): string | null {
    if (!v) return null;
    try {
      const d = new Date(v);
      if (isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 10);
    } catch {
      return null;
    }
  }

  private todayISO(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
