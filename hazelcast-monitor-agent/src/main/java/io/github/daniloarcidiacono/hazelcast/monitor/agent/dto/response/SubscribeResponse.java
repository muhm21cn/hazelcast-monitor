package io.github.daniloarcidiacono.hazelcast.monitor.agent.dto.response;

import io.github.daniloarcidiacono.typescriptmapper.core.annotation.TypescriptDTO;
import io.github.daniloarcidiacono.hazelcast.monitor.agent.dto.AbstractMessage;
import io.github.daniloarcidiacono.hazelcast.monitor.agent.dto.topic.AbstractTopic;

@TypescriptDTO
public class SubscribeResponse extends AbstractMessage {
    public static transient final String MESSAGE_TYPE = "subscribe_response";
    private long subscriptionId;
    private AbstractTopic topic;

    public SubscribeResponse() {
        super(MESSAGE_TYPE);
    }

    public SubscribeResponse(final AbstractTopic topic, final long subscriptionId) {
        super(MESSAGE_TYPE);
        this.topic = topic;
        this.subscriptionId = subscriptionId;
    }

    public AbstractTopic getTopic() {
        return topic;
    }

    public void setTopic(AbstractTopic topic) {
        this.topic = topic;
    }

    public long getSubscriptionId() {
        return subscriptionId;
    }

    public void setSubscriptionId(long subscriptionId) {
        this.subscriptionId = subscriptionId;
    }
}
