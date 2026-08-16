import { Controller, Get, Inject } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  HealthService,
  type HealthResponse,
  type ReadinessResponse,
} from "./health.service";
import { Public } from "../http/public.decorator";

@ApiTags("system")
@Controller()
@Public()
export class HealthController {
  constructor(
    @Inject(HealthService) private readonly healthService: HealthService,
  ) {}

  @Get("health")
  @ApiOperation({ summary: "Check whether the API process is alive" })
  @ApiOkResponse({ description: "The API process is alive" })
  health(): HealthResponse {
    return this.healthService.liveness();
  }

  @Get("ready")
  @ApiOperation({ summary: "Check whether the API can serve traffic" })
  @ApiOkResponse({ description: "The API and database are ready" })
  @ApiServiceUnavailableResponse({
    description: "A required dependency is unavailable",
  })
  ready(): Promise<ReadinessResponse> {
    return this.healthService.readiness();
  }
}
