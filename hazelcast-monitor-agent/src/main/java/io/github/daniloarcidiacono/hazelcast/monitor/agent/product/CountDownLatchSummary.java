package io.github.daniloarcidiacono.hazelcast.monitor.agent.product;

import io.github.daniloarcidiacono.typescriptmapper.core.annotation.TypescriptDTO;

@TypescriptDTO
public class CountDownLatchSummary extends DistributedObjectSummary {
    private int count;

    public CountDownLatchSummary(int count) {
        this.count = count;
    }

    public int getCount() {
        return count;
    }

    public void setCount(int count) {
        this.count = count;
    }
}
