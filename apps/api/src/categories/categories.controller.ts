import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { CategoriesService } from "./categories.service";
import { CategoryResponseDto } from "./categories.dto";
import type {
  CategoryQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from "./categories.dto";

@ApiTags("Categories")
@ApiCookieAuth("sfp_access")
@Controller("categories")
export class CategoriesController {
  constructor(
    @Inject(CategoriesService) private readonly categories: CategoriesService,
  ) {}

  @Get()
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: CategoryQueryDto,
  ) {
    return this.categories.list(principal.userId, query.includeArchived);
  }

  @Post()
  @ApiCreatedResponse({ type: CategoryResponseDto })
  create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: CreateCategoryDto,
  ) {
    return this.categories.create(principal.userId, input);
  }

  @Patch(":categoryId")
  @ApiOkResponse({ type: CategoryResponseDto })
  update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("categoryId", ParseUUIDPipe) id: string,
    @Body() input: UpdateCategoryDto,
  ) {
    return this.categories.update(principal.userId, id, input);
  }

  @Delete(":categoryId")
  @ApiOkResponse({ type: CategoryResponseDto })
  archive(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("categoryId", ParseUUIDPipe) id: string,
  ) {
    return this.categories.archive(principal.userId, id);
  }
}
