import {Injectable} from '@angular/core';
import {
  AbstractMessageDTO, AuthenticateRequestDTO, AuthenticateResponseDTO,
  ErrorMessageDTO,
  PullSubscriptionRequestDTO,
  SubscribeRequestDTO,
  SubscribeResponseDTO,
  SubscriptionNoticeResponseDTO,
  UnsubscribeRequestDTO,
  UpdateSubscriptionRequestDTO,
  UpdateSubscriptionResponseDTO
} from '@shared/dto/hazelcast-monitor.dto';
import {Observable, Observer, of, Subscription} from 'rxjs/index';
import {SharedWebSocketService} from '@shared/services/shared-websocket.service';
import {
  ClustersTopicDTO,
  DistributedObjectStatsTopicDTO,
  DistributedObjectsTopicDTO,
  DistributedObjectTopicDTO,
  DistributedObjectType,
  InternalsTopicDTO,
  MembersTopicDTO,
  StatisticsTopicDTO
} from '@shared/dto/topics.dto';
import {mergeAll} from 'rxjs/internal/operators';
import {
  ClustersProductDTO,
  DistributedObjectsProductDTO,
  InternalsProductDTO,
  ListProductDTO,
  MapProductDTO,
  MembersProductDTO,
  StatisticsProductDTO,
  TopicProductDTO
} from '@shared/dto/topic-products.dto';
import {
  AtomicLongsProductDTO,
  AtomicReferencesProductDTO,
  CacheProductDTO,
  CachesProductDTO,
  CacheStatsProductDTO,
  CardinalityEstimatorsProductDTO,
  CountDownLatchesProductDTO,
  ExecutorsProductDTO,
  ExecutorStatsProductDTO,
  ListsProductDTO,
  LocksProductDTO,
  MapsProductDTO,
  MultiMapProductDTO,
  MultiMapsProductDTO,
  QueueProductDTO,
  QueuesProductDTO,
  QueueStatsProductDTO,
  ReplicatedMapProductDTO,
  ReplicatedMapsProductDTO,
  RingbuffersProductDTO,
  SemaphoresProductDTO,
  SetProductDTO,
  SetsProductDTO,
  TopicsProductDTO,
  TopicStatsProductDTO
} from "@shared/dto/topic-products-aliases.dto";

@Injectable()
export class SharedHazelcastAgentService {
  private parsedMessages: Observable<AbstractMessageDTO>;

  public constructor(private wsService: SharedWebSocketService) {
    this.parsedMessages = this.parseMessages();
  }

  private parseMessages(): Observable<AbstractMessageDTO> {
    return new Observable<AbstractMessageDTO>((observer: Observer<AbstractMessageDTO>) => {
      const sub: Subscription = this.wsService.onMessageReceived.subscribe(
        (message: string) => {
          try {
            const parsedMessage: AbstractMessageDTO = JSON.parse(message);
            if (parsedMessage.messageType === 'error') {
              observer.error(parsedMessage as ErrorMessageDTO);
            } else {
              observer.next(parsedMessage);
            }
          } catch (e) {
            // Just ignore it
          }
        },
        (error: any) => {
          observer.error(error);
        },
        () => {
          observer.complete();
        }
      );

      return () => {
        sub.unsubscribe();
      };
    });
  }

  private filterById(id: number): (stream: Observable<AbstractMessageDTO>) => Observable<AbstractMessageDTO> {
    return (stream: Observable<AbstractMessageDTO>) => {
      return new Observable<AbstractMessageDTO>((observer: Observer<AbstractMessageDTO>) => {
        const sub: Subscription = stream.subscribe(
          (message: AbstractMessageDTO) => {
            if (message.messageId === id) {
              observer.next(message);
            }
          },
          (error: ErrorMessageDTO) => {
            observer.error(error);
          },
          () => {
            observer.complete();
          }
        );

        return () => {
          sub.unsubscribe();
        };
      });
    };
  }

  private filterNoticesBySubscriptionId<T>(subscriptionId: number): (stream: Observable<AbstractMessageDTO>) => Observable<SubscriptionNoticeResponseDTO<T>> {
    return (stream: Observable<AbstractMessageDTO>) => {
      return new Observable<SubscriptionNoticeResponseDTO<T>>((observer: Observer<SubscriptionNoticeResponseDTO<T>>) => {
        const sub: Subscription = stream.subscribe(
          (message: AbstractMessageDTO) => {
            if (message.messageType === 'notice') {
              const subNotice: SubscriptionNoticeResponseDTO<T> = message as SubscriptionNoticeResponseDTO<T>;
              if (subNotice.subscriptionId === subscriptionId) {
                observer.next(subNotice);
              }
            }
          },
          (error: ErrorMessageDTO) => {
            observer.error(error);
          },
          () => {
            observer.complete();
          }
        );

        return () => {
          sub.unsubscribe();
        };
      });
    };
  }

  private takeFirstSubscriptionResponse(stream: Observable<AbstractMessageDTO>): Observable<SubscribeResponseDTO> {
    return new Observable<SubscribeResponseDTO>((observer: Observer<SubscribeResponseDTO>) => {
      const sub: Subscription = stream.subscribe(
        (message: AbstractMessageDTO) => {
          if (message.messageType === 'subscribe_response') {
            const subResponse: SubscribeResponseDTO = message as SubscribeResponseDTO;
            observer.next(subResponse);
            observer.complete();
          }
        },
        (error: ErrorMessageDTO) => {
          observer.error(error);
        },
        () => {
          observer.complete();
        }
      );

      return () => {
        sub.unsubscribe();
      };
    });
  }

  private mapToNoticeStreams<T>(stream: Observable<SubscribeResponseDTO>): Observable<Observable<SubscriptionNoticeResponseDTO<T>>> {
    return new Observable<Observable<SubscriptionNoticeResponseDTO<T>>>((observer: Observer<Observable<SubscriptionNoticeResponseDTO<T>>>) => {
      const sub: Subscription = stream.subscribe(
        (subResponse: SubscribeResponseDTO) => {
          const noticeObs: Observable<SubscriptionNoticeResponseDTO<T>> = this.parsedMessages.pipe(
            this.filterNoticesBySubscriptionId<T>(subResponse.subscriptionId).bind(this)
          );

          observer.next(noticeObs);
        },
        (error: ErrorMessageDTO) => {
          observer.error(error);
        },
        () => {
          observer.complete();
        }
      );

      return () => {
        sub.unsubscribe();
      };
    });
  }

  private subTo<T>(subRequest: SubscribeRequestDTO): Observable<SubscriptionNoticeResponseDTO<T>> {
    const subResponsePromise: Promise<SubscribeResponseDTO> = this.parsedMessages.pipe(
      this.filterById(subRequest.messageId),
      this.takeFirstSubscriptionResponse.bind(this)
    ).toPromise() as Promise<SubscribeResponseDTO>;

    this.wsService.sendMessage(JSON.stringify(subRequest));

    return new Observable<SubscriptionNoticeResponseDTO<T>>((observer: Observer<SubscriptionNoticeResponseDTO<T>>) => {
      let noticeSub: Subscription;
      let subResponse: SubscribeResponseDTO;
      subResponsePromise.then((subscriptionResponse: SubscribeResponseDTO) => {
        const noticesObs: Observable<SubscriptionNoticeResponseDTO<T>> = of(subscriptionResponse).pipe(
          this.mapToNoticeStreams.bind(this),
          mergeAll()
        );

        // Inject the subscription response in the subscriber
        observer['subscribeResponse'] = subscriptionResponse;

        // Keep track of the subscription response for teardown logic
        subResponse = subscriptionResponse;

        // Subcribe to notices
        noticeSub = noticesObs.subscribe(
          (notice: SubscriptionNoticeResponseDTO<T>) => {
            observer.next(notice);
          },
          (error: ErrorMessageDTO) => {
            observer.error(error);
          },
          () => {
            observer.complete();
          }
        );
      }).catch((error: ErrorMessageDTO) => {
        observer.error(error);
      });

      return () => {
        if (!!noticeSub) {
          noticeSub.unsubscribe();
        }

        if (!!subResponse) {
          const unSubRequest: UnsubscribeRequestDTO = {
            messageType: 'unsubscribe',
            subscriptionId: subResponse.subscriptionId
          };

          this.wsService.sendMessage(JSON.stringify(unSubRequest));
        }
      };
    });
  }

  public sendPullSubscription(subscriptionId: number): void {
    const request: PullSubscriptionRequestDTO = {
      messageId: this.wsService.generateMessageId(),
      messageType: 'pull_subscription',
      subscriptionId: subscriptionId
    };

    // Send the request
    this.wsService.sendMessage(JSON.stringify(request));
  }

  public sendUpdateSubscription(request: UpdateSubscriptionRequestDTO): Promise<UpdateSubscriptionResponseDTO> {
    // Send the request
    this.wsService.sendMessage(JSON.stringify(request));

    // Create an observable listening for UpdateSubscriptionResponseDTO
    return new Observable<UpdateSubscriptionResponseDTO>((observer: Observer<UpdateSubscriptionResponseDTO>) => {
      const sub: Subscription = this.parsedMessages.subscribe(
        (message: AbstractMessageDTO) => {
          if (message.messageType === 'update_subscription_response') {
            observer.next(message as UpdateSubscriptionResponseDTO);
            observer.complete();
          }
        },
        (error: ErrorMessageDTO) => {
          observer.error(error);
        },
        () => {
          observer.complete();
        }
      );

      return () => {
        sub.unsubscribe();
      };
    }).toPromise();
  }

  public sendAuthenticate(groupName: string, groupPassword: string): Promise<AuthenticateResponseDTO> {
    const request: AuthenticateRequestDTO = {
      messageId: this.wsService.generateMessageId(),
      messageType: 'authenticate',
      groupName: groupName,
      groupPassword: groupPassword
    };

    // Send the request
    this.wsService.sendMessage(JSON.stringify(request));

    // Create an observable listening for AuthenticateResponseDTO
    return new Observable<AuthenticateResponseDTO>((observer: Observer<AuthenticateResponseDTO>) => {
      const sub: Subscription = this.parsedMessages.subscribe(
        (message: AbstractMessageDTO) => {
          if (message.messageType === 'authenticate_response') {
            observer.next(message as AuthenticateResponseDTO);
            observer.complete();
          }
        },
        (error: ErrorMessageDTO) => {
          observer.error(error);
        },
        () => {
          observer.complete();
        }
      );

      return () => {
        sub.unsubscribe();
      };
    }).toPromise();
  }

  // Misc
  public subscribeToClusters(): Observable<SubscriptionNoticeResponseDTO<ClustersProductDTO>> {
    const subRequest: SubscribeRequestDTO = {
      messageType: 'subscribe',
      messageId: this.wsService.generateMessageId(),
      frequency: 5,
      topic: <ClustersTopicDTO>{
        topicType: 'clusters'
      }
    };

    return this.subTo(subRequest);
  }

  public subscribeToInternals(instanceName: string): Observable<SubscriptionNoticeResponseDTO<InternalsProductDTO>> {
    const subRequest: SubscribeRequestDTO = {
      messageType: 'subscribe',
      messageId: this.wsService.generateMessageId(),
      frequency: 5,
      topic: <InternalsTopicDTO>{
        topicType: 'internals',
        instanceName: instanceName
      }
    };

    return this.subTo(subRequest);
  }

  public subscribeToStatistics(instanceName: string): Observable<SubscriptionNoticeResponseDTO<StatisticsProductDTO>> {
    const subRequest: SubscribeRequestDTO = {
      messageType: 'subscribe',
      messageId: this.wsService.generateMessageId(),
      frequency: 1,
      topic: <StatisticsTopicDTO>{
        topicType: 'stats',
        instanceName: instanceName
      }
    };

    return this.subTo(subRequest);
  }

  public subscribeToMembers(instanceName: string): Observable<SubscriptionNoticeResponseDTO<MembersProductDTO>> {
    const subRequest: SubscribeRequestDTO = {
      messageType: 'subscribe',
      messageId: this.wsService.generateMessageId(),
      frequency: 1,
      topic: <MembersTopicDTO>{
        topicType: 'members',
        instanceName: instanceName
      }
    };

    return this.subTo(subRequest);
  }

  // Distributed objects
  public subscribeToDistributedObjects(instanceName: string, distributedObjectType: DistributedObjectType, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<DistributedObjectsProductDTO<any>>> {
    const subRequest: SubscribeRequestDTO = {
      messageType: 'subscribe',
      messageId: this.wsService.generateMessageId(),
      frequency: 1,
      topic: <DistributedObjectsTopicDTO>{
        topicType: 'distributed_object',
        instanceName: instanceName,
        distributedObjectType: distributedObjectType
      },
      parameters: parameters
    };

    return this.subTo(subRequest);
  }

  public subscribeToMaps(instanceName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<MapsProductDTO>> {
    return this.subscribeToDistributedObjects(instanceName, DistributedObjectType.MAP, parameters);
  }

  public subscribeToLists(instanceName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<ListsProductDTO>> {
    return this.subscribeToDistributedObjects(instanceName, DistributedObjectType.LIST, parameters);
  }

  public subscribeToLocks(instanceName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<LocksProductDTO>> {
    return this.subscribeToDistributedObjects(instanceName, DistributedObjectType.LOCK, parameters);
  }

  public subscribeToMultiMaps(instanceName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<MultiMapsProductDTO>> {
    return this.subscribeToDistributedObjects(instanceName, DistributedObjectType.MULTIMAP, parameters);
  }

  public subscribeToReplicatedMaps(instanceName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<ReplicatedMapsProductDTO>> {
    return this.subscribeToDistributedObjects(instanceName, DistributedObjectType.REPLICATEDMAP, parameters);
  }

  public subscribeToQueues(instanceName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<QueuesProductDTO>> {
    return this.subscribeToDistributedObjects(instanceName, DistributedObjectType.QUEUE, parameters);
  }

  public subscribeToSets(instanceName: string,  parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<SetsProductDTO>> {
    return this.subscribeToDistributedObjects(instanceName, DistributedObjectType.SET, parameters);
  }

  public subscribeToTopics(instanceName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<TopicsProductDTO>> {
    return this.subscribeToDistributedObjects(instanceName, DistributedObjectType.TOPIC, parameters);
  }

  public subscribeToExecutors(instanceName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<ExecutorsProductDTO>> {
    return this.subscribeToDistributedObjects(instanceName, DistributedObjectType.EXECUTOR, parameters);
  }

  public subscribeToCardinalityEstimators(instanceName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<CardinalityEstimatorsProductDTO>> {
    return this.subscribeToDistributedObjects(instanceName, DistributedObjectType.CARDINALITYESTIMATOR, parameters);
  }

  public subscribeToAtomicLongs(instanceName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<AtomicLongsProductDTO>> {
    return this.subscribeToDistributedObjects(instanceName, DistributedObjectType.ATOMICLONG, parameters);
  }

  public subscribeToAtomicReferences(instanceName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<AtomicReferencesProductDTO>> {
    return this.subscribeToDistributedObjects(instanceName, DistributedObjectType.ATOMICREFERENCE, parameters);
  }

  public subscribeToCountdownLatches(instanceName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<CountDownLatchesProductDTO>> {
    return this.subscribeToDistributedObjects(instanceName, DistributedObjectType.COUNTDOWNLATCH, parameters);
  }

  public subscribeToSemaphores(instanceName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<SemaphoresProductDTO>> {
    return this.subscribeToDistributedObjects(instanceName, DistributedObjectType.SEMAPHORE, parameters);
  }

  public subscribeToCaches(instanceName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<CachesProductDTO>> {
    return this.subscribeToDistributedObjects(instanceName, DistributedObjectType.CACHE, parameters);
  }

  public subscribeToRingbuffers(instanceName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<RingbuffersProductDTO>> {
    return this.subscribeToDistributedObjects(instanceName, DistributedObjectType.RINGBUFFER, parameters);
  }

  // Distributed object
  private subscribeToDistributedObject(instanceName: string, distributedObjectType: DistributedObjectType, objectName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<any>> {
    const subRequest: SubscribeRequestDTO = {
      messageType: 'subscribe',
      messageId: this.wsService.generateMessageId(),
      frequency: 1,
      topic: <DistributedObjectTopicDTO>{
        topicType: 'distributed_object_details',
        instanceName: instanceName,
        distributedObjectType: distributedObjectType,
        objectName: objectName
      },
      parameters: parameters
    };

    return this.subTo(subRequest);
  }

  public subscribeToMap(instanceName: string, mapName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<MapProductDTO>> {
    return this.subscribeToDistributedObject(instanceName, DistributedObjectType.MAP, mapName, parameters);
  }

  public subscribeToList(instanceName: string, listName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<ListProductDTO>> {
    return this.subscribeToDistributedObject(instanceName, DistributedObjectType.LIST, listName, parameters);
  }

  public subscribeToMultiMap(instanceName: string, multiMapName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<MultiMapProductDTO>> {
    return this.subscribeToDistributedObject(instanceName, DistributedObjectType.MULTIMAP, multiMapName, parameters);
  }

  public subscribeToReplicatedMap(instanceName: string, replicatedMapName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<ReplicatedMapProductDTO>> {
    return this.subscribeToDistributedObject(instanceName, DistributedObjectType.REPLICATEDMAP, replicatedMapName, parameters);
  }

  public subscribeToQueue(instanceName: string, queueName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<QueueProductDTO>> {
    return this.subscribeToDistributedObject(instanceName, DistributedObjectType.QUEUE, queueName, parameters);
  }

  public subscribeToSet(instanceName: string, setName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<SetProductDTO>> {
    return this.subscribeToDistributedObject(instanceName, DistributedObjectType.SET, setName, parameters);
  }

  public subscribeToTopic(instanceName: string, topicName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<TopicProductDTO>> {
    return this.subscribeToDistributedObject(instanceName, DistributedObjectType.TOPIC, topicName, parameters);
  }

  public subscribeToCache(instanceName: string, cacheName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<CacheProductDTO>> {
    return this.subscribeToDistributedObject(instanceName, DistributedObjectType.CACHE, cacheName, parameters);
  }

  // Statistics
  public subscribeToDistributedObjectStats(instanceName: string, distributedObjectType: DistributedObjectType, objectName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<any>> {
    const subRequest: SubscribeRequestDTO = {
      messageType: 'subscribe',
      messageId: this.wsService.generateMessageId(),
      frequency: 1,
      topic: <DistributedObjectStatsTopicDTO>{
        topicType: 'distributed_object_stats',
        instanceName: instanceName,
        distributedObjectType: distributedObjectType,
        objectName: objectName
      },
      parameters: parameters
    };

    return this.subTo(subRequest);
  }

  public subscribeToTopicStats(instanceName: string, topicName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<TopicStatsProductDTO>> {
    return this.subscribeToDistributedObjectStats(instanceName, DistributedObjectType.TOPIC, topicName, parameters);
  }

  public subscribeToQueueStats(instanceName: string, queueName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<QueueStatsProductDTO>> {
    return this.subscribeToDistributedObjectStats(instanceName, DistributedObjectType.QUEUE, queueName, parameters);
  }

  public subscribeToExecutorStats(instanceName: string, executorName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<ExecutorStatsProductDTO>> {
    return this.subscribeToDistributedObjectStats(instanceName, DistributedObjectType.EXECUTOR, executorName, parameters);
  }

  public subscribeToCacheStats(instanceName: string, cacheName: string, parameters?: { [ index: string ]: string }): Observable<SubscriptionNoticeResponseDTO<CacheStatsProductDTO>> {
    return this.subscribeToDistributedObjectStats(instanceName, DistributedObjectType.CACHE, cacheName, parameters);
  }
}
