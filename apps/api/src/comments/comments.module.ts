import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { AuditModule } from "../audit/audit.module";
import { ExpensesModule } from "../expenses/expenses.module";
import { CommentsController } from "./comments.controller";
import { CommentsService } from "./comments.service";

@Module({
  imports: [ActivitiesModule, AuditModule, ExpensesModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
