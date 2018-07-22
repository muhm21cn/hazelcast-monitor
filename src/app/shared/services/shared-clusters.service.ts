import {Injectable} from '@angular/core';
import {SharedWebStorageService} from "./shared-webstorage.service";
import {Cluster} from "../model/shared-cluster.model";

@Injectable()
export class SharedClustersService {
  private clusters: Cluster[];
  private currentCluster: Cluster;

  public constructor(private storage: SharedWebStorageService) {
    // TODO: Read from web storage
    // this.clusters = this.storage.get(SharedStorageConstants.CLUSTERS_KEY) || [];
    // this.currentCluster = this.storage.get(SharedStorageConstants.CURRENT_CLUSTER_KEY);
    this.clusters = [];
    this.currentCluster = undefined;
  }

  public mergeClusters(clusters: Cluster[]): void {
    this.clusters.push(...clusters);
  }

  public getCurrentCluster(): Cluster {
    return this.currentCluster;
  }

  public hasClusters(): boolean {
    return this.clusters.length > 0;
  }

  public setCurrentCluster(cluster: Cluster): void {
    this.currentCluster = cluster;
  }

  public hasCurrentCluster(): boolean {
    return this.currentCluster !== undefined;
  }

  public getClusters(): Cluster[] {
    return this.clusters;
  }
}
