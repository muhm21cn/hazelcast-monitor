import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {SharedServicesModule} from '@shared/services/shared-services.module';
import {SharedMdcTableModule} from '@shared/components/mdc-table/shared-mdc-table.module';
import {PageDashboardLocksComponent} from './page-dashboard-locks.component';
import {MdcIconButtonModule, MdcTextFieldModule, MdcTypographyModule} from '@angular-mdc/web';
import {SharedMdcPaginatorModule} from '@shared/components/mdc-paginator/shared-mdc-paginator.module';
import {FormsModule} from '@angular/forms';

@NgModule({
  declarations: [
    PageDashboardLocksComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,

    // Angular MDC Web
    MdcTypographyModule,
    MdcIconButtonModule,
    MdcTextFieldModule,

    // Shared
    SharedMdcTableModule,
    SharedMdcPaginatorModule,
    SharedServicesModule
  ],
  providers: [
  ]
})

export class PageDashboardLocksModule {
}
