import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Online } from './online';

describe('Online', () => {
  let component: Online;
  let fixture: ComponentFixture<Online>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Online],
    }).compileComponents();

    fixture = TestBed.createComponent(Online);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
