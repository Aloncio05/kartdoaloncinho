        camera.updateProjectionMatrix();
        lastW = w;
        lastH = h;
      }
      r.racers.forEach((p, i) => {
        const t = at(p.s),
          k = karts[i];
        k.root.position.set(
          t.x + t.nx * p.offset,
          0.04 +
            (p.air || 0) +
            (p.rampHeight || 0) +
            Math.sin(time * 18 + i) * 0.018 * (p.speed / 45),
          t.z + t.nz * p.offset,
        );
        k.root.rotation.y =
          t.angle + p.yaw + (p.stun > 0 ? Math.sin(time * 20) * 0.45 : 0);
        k.root.rotation.z = p.yaw * 0.065;
        k.root.rotation.x =
          p.air > 0
            ? Math.max(-0.18, Math.min(0.18, -p.verticalSpeed * 0.018))
            : p.rampHeight > 0
              ? -0.16
              : 0;
        k.animate(p, time);
      });
      trailTimer += dt;
      for (const particle of trail) {
        if (particle.life <= 0) continue;
        particle.life -= dt;
        particle.mesh.visible = particle.life > 0;
        particle.mesh.position.addScaledVector(particle.velocity, dt);
        particle.mesh.scale.setScalar(Math.max(0.01, particle.life * 1.8));
      }
      if (trailTimer >= 0.045) {
        trailTimer = 0;
        for (let i = 0; i < r.racers.length; i++) {
          const racer = r.racers[i];
          if (racer.boost <= 0 && !racer.drifting) continue;
          const kart = karts[i].root;
          const particle = trail[trailCursor++ % trail.length];
          const side = (trailCursor % 2 ? 1 : -1) * 0.9;
          particle.mesh.position.copy(kart.localToWorld(new THREE.Vector3(side, 0.5, -2)));
          particle.velocity.set((Math.random() - 0.5) * 2, 1.1 + Math.random(), (Math.random() - 0.5) * 2);
          particle.life = 0.45;
          particle.mesh.visible = true;
        }
      }
      pickups.forEach((g, i) => {
        g.visible = r.pickups[i].cooldown <= 0;
        g.rotation.y = time;
        g.position.y = 1.65 + Math.sin(time * 2 + i) * 0.18;
      });
      hazards.forEach((g, i) => {
        const h = r.hazards[i];
        g.visible = !!h;
        if (h) {
          const p = at(h.s);
          g.position.set(p.x + p.nx * h.offset, 0.14, p.z + p.nz * h.offset);
        }
      });
      skidTime += dt;
      if (skidTime > 0.04) {
        skidTime = 0;
        for (const p of r.racers)
          if (p.drifting && p.air < 0.1) {
            const k = karts[p.id].root;
            for (const x of [-1.24, 1.24]) {
              dummy.position.copy(
                k.localToWorld(new THREE.Vector3(x, 0.105, -1)),
              );
              dummy.position.y = 0.135;
              dummy.rotation.set(-Math.PI / 2, 0, -k.rotation.y);
              dummy.scale.set(1, 1, 1);
              dummy.updateMatrix();
              skids.setMatrixAt(skidIndex++ % 400, dummy.matrix);
            }
          }
        skids.instanceMatrix.needsUpdate = true;
      }
      const p = r.racers[localIndex],
        t = at(p.s),
        k = karts[localIndex].root.position;
      if (r.state === 'menu') {
        const base = at(-16);
        target.set(base.x - base.nx * 10, 5.3, base.z - base.nz * 10);
        look.set(start.x, 1.3, start.z);
      } else {
        const a = t.angle + p.yaw * 0.65;
        target.set(k.x - Math.sin(a) * 8.7, k.y + 4.7, k.z - Math.cos(a) * 8.7);
        look.set(
          k.x + Math.sin(a) * 8,
          1.25 + (p.air || 0) * 0.5,
          k.z + Math.cos(a) * 8,
        );
      }
      if (!initialized) {
        camera.position.copy(target);
        smoothLook.copy(look);
        initialized = true;
      } else {
        camera.position.lerp(target, 1 - Math.exp(-dt * 8));
        smoothLook.lerp(look, 1 - Math.exp(-dt * 12));
      }
      camera.lookAt(smoothLook);
      sun.position.set(k.x - 70, 130, k.z - 70);
      sun.target.position.set(k.x, 0, k.z);
      const fov = 58 + Math.min(5, Math.max(0, p.speed) / 10) + (p.boost > 0 ? 7 : 0);
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 5);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    },
    dispose() {
      const geos = new Set(),
        mats = new Set(),
        textures = new Set();
      scene.traverse((o) => {
        if (o.geometry) geos.add(o.geometry);
        for (const m of o.material
          ? Array.isArray(o.material)
            ? o.material
            : [o.material]
          : []) {
          mats.add(m);
          if (m.map) textures.add(m.map);
        }
      });
      geos.forEach((g) => g.dispose());
