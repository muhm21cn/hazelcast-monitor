package io.github.daniloarcidiacono.hazelcast.monitor.agent.dto.request;

import io.github.daniloarcidiacono.typescriptmapper.core.annotation.TypescriptDTO;
import io.github.daniloarcidiacono.hazelcast.monitor.agent.dto.AbstractMessage;

@TypescriptDTO
public class UnsubscribeRequest extends AbstractMessage {
    public static final String MESSAGE_TYPE = "unsubscribe";
    private long subscriptionId;

    public UnsubscribeRequest() {
        super(MESSAGE_TYPE);
    }

    public long getSubscriptionId() {
        return subscriptionId;
    }

    public void setSubscriptionId(long subscriptionId) {
        this.subscriptionId = subscriptionId;
    }
}
