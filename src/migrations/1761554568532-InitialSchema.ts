import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1761554568532 implements MigrationInterface {
    name = 'InitialSchema1761554568532'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "apartments" DROP CONSTRAINT "FK_1f75995a38751fa73fc87355718"`);
        await queryRunner.query(`ALTER TABLE "balances" DROP CONSTRAINT "FK_8c6c1f8b8e299c919bb3a92d0ce"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "provider"`);
        await queryRunner.query(`ALTER TABLE "apartments" DROP COLUMN "residentId"`);
        await queryRunner.query(`ALTER TABLE "balances" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "balances" DROP COLUMN "as_of_date"`);
        await queryRunner.query(`ALTER TABLE "balances" ADD "as_of_date" date NOT NULL`);
        await queryRunner.query(`ALTER TABLE "apartments" ADD "residentId" integer`);
        await queryRunner.query(`ALTER TABLE "balances" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "apartments" ADD CONSTRAINT "UQ_24e51578ee2e8a8893c3e73dc98" UNIQUE ("number")`);
        await queryRunner.query(`ALTER TABLE "apartments" ALTER COLUMN "address" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "balances" ALTER COLUMN "amount" TYPE numeric(14,2)`);
        await queryRunner.query(`ALTER TABLE "balances" ALTER COLUMN "amount" SET DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "balances" ADD CONSTRAINT "FK_8c6c1f8b8e299c919bb3a92d0ce" FOREIGN KEY ("apartmentId") REFERENCES "apartments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "apartments" ADD CONSTRAINT "FK_1f75995a38751fa73fc87355718" FOREIGN KEY ("residentId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "apartments" DROP CONSTRAINT "FK_1f75995a38751fa73fc87355718"`);
        await queryRunner.query(`ALTER TABLE "balances" DROP CONSTRAINT "FK_8c6c1f8b8e299c919bb3a92d0ce"`);
        await queryRunner.query(`ALTER TABLE "balances" ALTER COLUMN "amount" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "balances" ALTER COLUMN "amount" TYPE numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "apartments" ALTER COLUMN "address" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "apartments" DROP CONSTRAINT "UQ_24e51578ee2e8a8893c3e73dc98"`);
        await queryRunner.query(`ALTER TABLE "balances" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "apartments" DROP COLUMN "residentId"`);
        await queryRunner.query(`ALTER TABLE "balances" DROP COLUMN "as_of_date"`);
        await queryRunner.query(`ALTER TABLE "balances" ADD "as_of_date" date NOT NULL`);
        await queryRunner.query(`ALTER TABLE "balances" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "apartments" ADD "residentId" integer`);
        await queryRunner.query(`ALTER TABLE "users" ADD "provider" character varying(50) DEFAULT 'local'`);
        await queryRunner.query(`ALTER TABLE "balances" ADD CONSTRAINT "FK_8c6c1f8b8e299c919bb3a92d0ce" FOREIGN KEY ("apartmentId") REFERENCES "apartments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "apartments" ADD CONSTRAINT "FK_1f75995a38751fa73fc87355718" FOREIGN KEY ("residentId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
