import { Module } from '@nestjs/common';
import { LicenseModule } from '../license/license.module';
import { ConnectorService } from './connector.service';
import { IntegrationRouterService } from './integration-router.service';
import { IntegrationStateService } from './integration-state.service';
import { CloudIntegrationClientService } from './cloud-integration-client.service';
import { ObsService } from './obs/obs.service';
import { PluginCatalogService } from './plugin-catalog.service';
import { PluginInstallService } from './plugin-install.service';

@Module({
  imports: [LicenseModule],
  providers: [
    PluginCatalogService,
    PluginInstallService,
    IntegrationRouterService,
    CloudIntegrationClientService,
    ConnectorService,
    IntegrationStateService,
    ObsService,
  ],
  exports: [
    PluginCatalogService,
    PluginInstallService,
    IntegrationRouterService,
    CloudIntegrationClientService,
    ConnectorService,
    IntegrationStateService,
    ObsService,
  ],
})
export class IntegrationsModule {}
