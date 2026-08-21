import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, Matches, Max, Min } from "class-validator";

export class SpendingAnalyticsQueryDto {
  @ApiProperty({ type: String, pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom!: string;
  @ApiProperty({ type: String, pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo!: string;
  @ApiProperty({ type: String, pattern: "^[A-Z]{3}$" })
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
  @ApiPropertyOptional({
    enum: ["YOUR_SHARE", "WHOLE_EXPENSE"],
    type: String,
    default: "YOUR_SHARE",
  })
  @IsIn(["YOUR_SHARE", "WHOLE_EXPENSE"])
  metric: "YOUR_SHARE" | "WHOLE_EXPENSE" = "YOUR_SHARE";
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 25, default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limit = 10;
}
