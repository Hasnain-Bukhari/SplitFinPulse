import { Body, Controller, Get, Inject, Post } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import type { CreateValuationDto } from "./currencies.dto";
import { CurrenciesService } from "./currencies.service";

@ApiTags("Currencies")
@ApiCookieAuth("sfp_access")
@Controller()
export class CurrenciesController {
  constructor(
    @Inject(CurrenciesService) private readonly currencies: CurrenciesService,
  ) {}
  @Get("currencies") list() {
    return this.currencies.list();
  }
  @Post("currency-valuations") create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: CreateValuationDto,
  ) {
    return this.currencies.createValuation(principal.userId, input);
  }
}
