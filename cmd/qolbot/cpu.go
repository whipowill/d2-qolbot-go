package main

import (
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// cpuMeter measures the processor time used by everything running in the app's Wine prefix (the games, the bridge,
// wineserver), as a share of the whole machine, averaged over the last minute. Linux only.
type cpuMeter struct {
	mu      sync.Mutex
	prev    map[int]uint64 // pid -> utime+stime ticks at the last sample
	prevAt  time.Time
	samples []float64 // percent of the whole machine, newest last
	cores   int
	have    bool
}

func (c *cpuMeter) sample(pids []int) {
	now := time.Now()
	cur := map[int]uint64{}
	for _, p := range pids {
		if t, ok := procTicks(p); ok {
			cur[p] = t
		}
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cores == 0 {
		c.cores = runtime.NumCPU()
	}
	if !c.prevAt.IsZero() {
		var d uint64
		for p, t := range cur {
			if old, ok := c.prev[p]; ok && t >= old {
				d += t - old
			}
		}
		secs := now.Sub(c.prevAt).Seconds()
		if secs > 0 {
			c.samples = append(c.samples, float64(d)/100/secs/float64(c.cores)*100) // 100 clock ticks per second
			if len(c.samples) > 12 {
				c.samples = c.samples[len(c.samples)-12:]
			}
			c.have = true
		}
	}
	c.prev, c.prevAt = cur, now
	if len(cur) == 0 {
		c.samples, c.have = nil, false
	}
}

// average returns the mean over the stored samples (percent of the machine) and the core count.
func (c *cpuMeter) average() (pct float64, cores int, ok bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.have || len(c.samples) == 0 {
		return 0, c.cores, false
	}
	var s float64
	for _, v := range c.samples {
		s += v
	}
	return s / float64(len(c.samples)), c.cores, true
}

// procTicks reads utime+stime (clock ticks) from /proc/<pid>/stat.
func procTicks(pid int) (uint64, bool) {
	b, err := os.ReadFile("/proc/" + strconv.Itoa(pid) + "/stat")
	if err != nil {
		return 0, false
	}
	s := string(b)
	i := strings.LastIndex(s, ")") // the name may hold spaces and brackets
	if i < 0 {
		return 0, false
	}
	f := strings.Fields(s[i+1:]) // f[0] is the state, which is field 3
	if len(f) < 13 {
		return 0, false
	}
	u, e1 := strconv.ParseUint(f[11], 10, 64)
	k, e2 := strconv.ParseUint(f[12], 10, 64)
	if e1 != nil || e2 != nil {
		return 0, false
	}
	return u + k, true
}

func (m *Manager) cpuSampler() {
	if runtime.GOOS != "linux" {
		return
	}
	for range time.Tick(5 * time.Second) {
		m.mu.Lock()
		running := false
		for _, s := range m.states {
			if s.Status == "running" || s.Status == "starting" {
				running = true
			}
		}
		m.mu.Unlock()
		if !running {
			m.cpu.sample(nil)
			continue
		}
		m.cpu.sample(prefixPids(m.absPrefix()))
	}
}
