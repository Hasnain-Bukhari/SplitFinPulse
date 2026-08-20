import { Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import type { SearchQueryDto } from "./search.dto";
import { SearchService } from "./search.service";

@ApiTags("Search")
@ApiCookieAuth("sfp_access")
@Controller("search")
export class SearchController {
  constructor(
    @Inject(SearchService) private readonly searchService: SearchService,
  ) {}
  @Get()
  search(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: SearchQueryDto,
  ) {
    return this.searchService.search(
      principal.userId,
      query.q,
      query.type ?? "ALL",
      query.limit ?? 10,
    );
  }
}
