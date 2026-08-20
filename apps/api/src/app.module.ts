import {
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { validateEnvironment } from "./config/environment";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { RequestIdMiddleware } from "./http/request-id.middleware";
import { RequestLoggerMiddleware } from "./http/request-logger.middleware";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { FriendsModule } from "./friends/friends.module";
import { GroupsModule } from "./groups/groups.module";
import { ExpensesModule } from "./expenses/expenses.module";
import { BalancesModule } from "./balances/balances.module";
import { ActivitiesModule } from "./activities/activities.module";
import { AuditModule } from "./audit/audit.module";
import { CommentsModule } from "./comments/comments.module";
import { SettlementsModule } from "./settlements/settlements.module";
import { CategoriesModule } from "./categories/categories.module";
import { SearchModule } from "./search/search.module";
import { CurrenciesModule } from "./currencies/currencies.module";
import { AttachmentsModule } from "./attachments/attachments.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: ["../../.env", ".env"],
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    FriendsModule,
    GroupsModule,
    ExpensesModule,
    BalancesModule,
    ActivitiesModule,
    CommentsModule,
    SettlementsModule,
    CategoriesModule,
    SearchModule,
    CurrenciesModule,
    AttachmentsModule,
    AuditModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, RequestLoggerMiddleware)
      .forRoutes({ path: "{*path}", method: RequestMethod.ALL });
  }
}
