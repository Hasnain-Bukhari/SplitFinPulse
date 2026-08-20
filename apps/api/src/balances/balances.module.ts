import { Module } from "@nestjs/common";
import { BalancesController } from "./balances.controller";
import { BalancesService } from "./balances.service";
import { CurrenciesModule } from "../currencies/currencies.module";

@Module({
  imports: [CurrenciesModule],
  controllers: [BalancesController],
  providers: [BalancesService],
  exports: [BalancesService],
})
export class BalancesModule {}
